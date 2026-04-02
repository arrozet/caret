/**
 * Repository for Y.js document snapshot persistence.
 * Handles periodic full-state checkpoints for fast document loading.
 *
 * Rule: all DB access lives here. Services never import Drizzle directly.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import type { CollabSnapshot, CollabSnapshotInsert } from "../models/index.js";

/**
 * Repository for document_collab_snapshots table operations.
 * Encapsulates all Drizzle ORM queries for Y.js snapshot persistence.
 * Receives the db client via constructor injection.
 */
export class CollabSnapshotRepository {
  /** Drizzle ORM database client. */
  private db: PostgresJsDatabase<typeof schema>;

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Insert a new snapshot and return the created record.
   * Validates that snapshot_seq > 0 (application-level constraint).
   *
   * @param data - Column values for the new snapshot.
   * @returns The inserted snapshot row.
   * @throws Error if snapshot_seq <= 0.
   */
  async create(data: CollabSnapshotInsert): Promise<CollabSnapshot> {
    this.validate_snapshot_seq(data.snapshot_seq);

    const rows = await this.db.insert(schema.document_collab_snapshots).values(data).returning();
    return rows[0];
  }

  /**
   * Find a snapshot by its UUID.
   *
   * @param id - Snapshot UUID.
   * @returns The snapshot row, or null if not found.
   */
  async find_by_id(id: string): Promise<CollabSnapshot | null> {
    const rows = await this.db
      .select()
      .from(schema.document_collab_snapshots)
      .where(eq(schema.document_collab_snapshots.id, id));
    return rows[0] ?? null;
  }

  /**
   * Find a snapshot by document_id and snapshot_seq.
   * Uses the unique index on (document_id, snapshot_seq).
   *
   * @param document_id - Document UUID.
   * @param snapshot_seq - Sequence number of the snapshot.
   * @returns The snapshot row, or null if not found.
   */
  async find_by_document_and_seq(
    document_id: string,
    snapshot_seq: number,
  ): Promise<CollabSnapshot | null> {
    const rows = await this.db
      .select()
      .from(schema.document_collab_snapshots)
      .where(
        and(
          eq(schema.document_collab_snapshots.document_id, document_id),
          eq(schema.document_collab_snapshots.snapshot_seq, snapshot_seq),
        ),
      );
    return rows[0] ?? null;
  }

  /**
   * Get the latest (most recent) snapshot for a document.
   * Uses the index on (document_id, snapshot_seq DESC).
   * Critical for fast document loading.
   *
   * @param document_id - Document UUID.
   * @returns The latest snapshot, or null if no snapshots exist.
   */
  async get_latest_snapshot(document_id: string): Promise<CollabSnapshot | null> {
    const rows = await this.db
      .select()
      .from(schema.document_collab_snapshots)
      .where(eq(schema.document_collab_snapshots.document_id, document_id))
      .orderBy(desc(schema.document_collab_snapshots.snapshot_seq))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * List all snapshots for a document, ordered by seq descending.
   *
   * @param document_id - Document UUID.
   * @returns Array of snapshots, newest first.
   */
  async list_by_document(document_id: string): Promise<CollabSnapshot[]> {
    return this.db
      .select()
      .from(schema.document_collab_snapshots)
      .where(eq(schema.document_collab_snapshots.document_id, document_id))
      .orderBy(desc(schema.document_collab_snapshots.snapshot_seq));
  }

  /**
   * Count snapshots for a document.
   *
   * @param document_id - Document UUID.
   * @returns Total number of snapshots.
   */
  async count_snapshots(document_id: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.document_collab_snapshots)
      .where(eq(schema.document_collab_snapshots.document_id, document_id));
    return result[0]?.count ?? 0;
  }

  /**
   * Delete a snapshot by its UUID.
   *
   * @param id - Snapshot UUID.
   * @returns The deleted snapshot, or null if not found.
   */
  async delete_by_id(id: string): Promise<CollabSnapshot | null> {
    const rows = await this.db
      .delete(schema.document_collab_snapshots)
      .where(eq(schema.document_collab_snapshots.id, id))
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Delete all snapshots for a document except the latest N.
   * Used to limit storage growth while keeping recent checkpoints.
   *
   * @param document_id - Document UUID.
   * @param keep_count - Number of most recent snapshots to keep.
   * @returns Number of deleted snapshots.
   */
  async delete_old_snapshots(document_id: string, keep_count: number): Promise<number> {
    if (keep_count < 1) {
      throw new Error("keep_count must be at least 1");
    }

    // Find the snapshot_seq threshold to keep
    const snapshots_to_keep = await this.db
      .select({ snapshot_seq: schema.document_collab_snapshots.snapshot_seq })
      .from(schema.document_collab_snapshots)
      .where(eq(schema.document_collab_snapshots.document_id, document_id))
      .orderBy(desc(schema.document_collab_snapshots.snapshot_seq))
      .limit(keep_count);

    if (snapshots_to_keep.length < keep_count) {
      // Not enough snapshots to delete any
      return 0;
    }

    const min_seq_to_keep = snapshots_to_keep[snapshots_to_keep.length - 1].snapshot_seq;

    const deleted = await this.db
      .delete(schema.document_collab_snapshots)
      .where(
        and(
          eq(schema.document_collab_snapshots.document_id, document_id),
          sql`snapshot_seq < ${min_seq_to_keep}`,
        ),
      )
      .returning({ id: schema.document_collab_snapshots.id });

    return deleted.length;
  }

  /**
   * Delete all snapshots for a document.
   * Used when a document is permanently deleted.
   *
   * @param document_id - Document UUID.
   * @returns Number of deleted snapshots.
   */
  async delete_all_snapshots(document_id: string): Promise<number> {
    const deleted = await this.db
      .delete(schema.document_collab_snapshots)
      .where(eq(schema.document_collab_snapshots.document_id, document_id))
      .returning({ id: schema.document_collab_snapshots.id });
    return deleted.length;
  }

  /**
   * Check if a document has any snapshots.
   *
   * @param document_id - Document UUID.
   * @returns True if at least one snapshot exists.
   */
  async has_snapshots(document_id: string): Promise<boolean> {
    const count = await this.count_snapshots(document_id);
    return count > 0;
  }

  /**
   * Validate that a snapshot sequence number is positive.
   * Enforces the CHECK constraint that Drizzle cannot express natively.
   *
   * @param snapshot_seq - Sequence number to validate.
   * @throws Error if snapshot_seq <= 0.
   */
  private validate_snapshot_seq(snapshot_seq: number): void {
    if (snapshot_seq <= 0) {
      throw new Error(`Invalid snapshot_seq: ${snapshot_seq}. Must be > 0.`);
    }
  }
}
