/**
 * Repository for Y.js CRDT update persistence.
 * Handles append-only log of incremental updates for collaborative documents.
 *
 * Rule: all DB access lives here. Services never import Drizzle directly.
 */

import { eq, and, gt, sql, asc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import type {
  CollabUpdate,
  CollabUpdateInsert,
  CollabUpdateKey,
  GetUpdatesAfterSeqParams,
  BatchInsertResult,
} from "../models/index.js";

/**
 * Repository for document_collab_updates table operations.
 * Encapsulates all Drizzle ORM queries for Y.js update persistence.
 * Receives the db client via constructor injection.
 */
export class CollabUpdateRepository {
  /** Drizzle ORM database client. */
  private db: PostgresJsDatabase<typeof schema>;

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Insert a single Y.js update and return the created record.
   * Validates that seq > 0 (application-level constraint).
   *
   * @param data - Column values for the new update.
   * @returns The inserted update row.
   * @throws Error if seq <= 0.
   */
  async create(data: CollabUpdateInsert): Promise<CollabUpdate> {
    this.validate_seq(data.seq);

    const rows = await this.db.insert(schema.document_collab_updates).values(data).returning();
    return rows[0];
  }

  /**
   * Insert multiple Y.js updates in a single transaction.
   * All updates must be for the same document.
   * Validates that all seq values are > 0.
   *
   * @param updates - Array of update records to insert.
   * @returns Result with count and last sequence number.
   * @throws Error if any seq <= 0 or updates is empty.
   */
  async create_batch(updates: CollabUpdateInsert[]): Promise<BatchInsertResult> {
    if (updates.length === 0) {
      throw new Error("Cannot insert empty batch of updates");
    }

    // Validate all sequence numbers
    for (const update of updates) {
      this.validate_seq(update.seq);
    }

    const rows = await this.db.insert(schema.document_collab_updates).values(updates).returning();

    // Find the highest seq in the inserted batch
    const last_seq = Math.max(...rows.map((r) => r.seq));

    return {
      inserted_count: rows.length,
      last_seq,
    };
  }

  /**
   * Find a single update by its composite key (document_id, seq).
   *
   * @param key - Composite key identifying the update.
   * @returns The update row, or null if not found.
   */
  async find_by_key(key: CollabUpdateKey): Promise<CollabUpdate | null> {
    const rows = await this.db
      .select()
      .from(schema.document_collab_updates)
      .where(
        and(
          eq(schema.document_collab_updates.document_id, key.document_id),
          eq(schema.document_collab_updates.seq, key.seq),
        ),
      );
    return rows[0] ?? null;
  }

  /**
   * Get all updates for a document after a specific sequence number.
   * Used during Y.js sync protocol to fetch missing updates.
   * Returns updates ordered by seq ascending for correct replay order.
   *
   * @param params - Query parameters including document_id and after_seq.
   * @returns Array of updates with seq > after_seq.
   */
  async get_updates_after_seq(params: GetUpdatesAfterSeqParams): Promise<CollabUpdate[]> {
    let query = this.db
      .select()
      .from(schema.document_collab_updates)
      .where(
        and(
          eq(schema.document_collab_updates.document_id, params.document_id),
          gt(schema.document_collab_updates.seq, params.after_seq),
        ),
      )
      .orderBy(asc(schema.document_collab_updates.seq));

    if (params.limit !== undefined) {
      query = query.limit(params.limit) as typeof query;
    }

    return query;
  }

  /**
   * Get all updates for a document (full history).
   * Ordered by seq ascending for correct replay order.
   * Use with caution on documents with many updates - prefer get_updates_after_seq.
   *
   * @param document_id - Document UUID.
   * @returns All updates for the document ordered by seq.
   */
  async get_all_updates(document_id: string): Promise<CollabUpdate[]> {
    return this.db
      .select()
      .from(schema.document_collab_updates)
      .where(eq(schema.document_collab_updates.document_id, document_id))
      .orderBy(asc(schema.document_collab_updates.seq));
  }

  /**
   * Get the highest sequence number for a document.
   * Used to determine the next seq value for new updates.
   *
   * @param document_id - Document UUID.
   * @returns The highest seq, or 0 if no updates exist.
   */
  async get_max_seq(document_id: string): Promise<number> {
    const result = await this.db
      .select({ max_seq: sql<number>`COALESCE(MAX(seq), 0)::int` })
      .from(schema.document_collab_updates)
      .where(eq(schema.document_collab_updates.document_id, document_id));
    return result[0]?.max_seq ?? 0;
  }

  /**
   * Count total updates for a document.
   * Useful for deciding when to create a snapshot.
   *
   * @param document_id - Document UUID.
   * @returns Total number of updates.
   */
  async count_updates(document_id: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.document_collab_updates)
      .where(eq(schema.document_collab_updates.document_id, document_id));
    return result[0]?.count ?? 0;
  }

  /**
   * Count updates after a specific sequence number.
   * Used to decide if a new snapshot is needed.
   *
   * @param document_id - Document UUID.
   * @param after_seq - Count updates with seq > after_seq.
   * @returns Number of updates after the given seq.
   */
  async count_updates_after_seq(document_id: string, after_seq: number): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.document_collab_updates)
      .where(
        and(
          eq(schema.document_collab_updates.document_id, document_id),
          gt(schema.document_collab_updates.seq, after_seq),
        ),
      );
    return result[0]?.count ?? 0;
  }

  /**
   * Delete all updates for a document up to and including a sequence number.
   * Used after creating a snapshot to compact the update log.
   *
   * @param document_id - Document UUID.
   * @param up_to_seq - Delete updates with seq <= up_to_seq.
   * @returns Number of deleted rows.
   */
  async delete_updates_up_to_seq(document_id: string, up_to_seq: number): Promise<number> {
    const result = await this.db
      .delete(schema.document_collab_updates)
      .where(
        and(eq(schema.document_collab_updates.document_id, document_id), sql`seq <= ${up_to_seq}`),
      )
      .returning({ seq: schema.document_collab_updates.seq });
    return result.length;
  }

  /**
   * Delete all updates for a document.
   * Used when a document is permanently deleted.
   *
   * @param document_id - Document UUID.
   * @returns Number of deleted rows.
   */
  async delete_all_updates(document_id: string): Promise<number> {
    const result = await this.db
      .delete(schema.document_collab_updates)
      .where(eq(schema.document_collab_updates.document_id, document_id))
      .returning({ seq: schema.document_collab_updates.seq });
    return result.length;
  }

  /**
   * Validate that a sequence number is positive.
   * Enforces the CHECK constraint that Drizzle cannot express natively.
   *
   * @param seq - Sequence number to validate.
   * @throws Error if seq <= 0.
   */
  private validate_seq(seq: number): void {
    if (seq <= 0) {
      throw new Error(`Invalid sequence number: ${seq}. Must be > 0.`);
    }
  }
}
