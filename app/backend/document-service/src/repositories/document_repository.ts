import { eq, and, isNull, desc, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import type { PaginationParams } from "../lib/validation.js";

/**
 * Repository for document CRUD operations.
 * Encapsulates all Drizzle ORM queries against the `documents` table.
 * Receives the db client via constructor injection.
 */
export class DocumentRepository {
  /** Drizzle ORM database client. */
  private db: PostgresJsDatabase<typeof schema>;

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Insert a new document row and return the created record.
   * @param data - Column values for the new document.
   * @returns The inserted document row.
   */
  async create(data: typeof schema.documents.$inferInsert) {
    const rows = await this.db
      .insert(schema.documents)
      .values(data)
      .returning();
    return rows[0];
  }

  /**
   * Find a single non-deleted document by its UUID.
   * @param id - Document UUID.
   * @returns The document row, or undefined if not found / deleted.
   */
  async find_by_id(id: string) {
    const rows = await this.db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.id, id), isNull(schema.documents.deleted_at)));
    return rows[0] ?? null;
  }

  /**
   * List non-deleted documents in a workspace with pagination, ordered by most recently updated.
   * @param workspace_id - Workspace UUID scope.
   * @param pagination - Limit and offset for pagination.
   * @returns Object with data array and total count.
   */
  async list_by_workspace(
    workspace_id: string,
    pagination: PaginationParams,
  ): Promise<{ data: (typeof schema.documents.$inferSelect)[]; total: number }> {
    const where_clause = and(
      eq(schema.documents.workspace_id, workspace_id),
      isNull(schema.documents.deleted_at),
    );

    const [data, count_result] = await Promise.all([
      this.db
        .select()
        .from(schema.documents)
        .where(where_clause)
        .orderBy(desc(schema.documents.updated_at))
        .limit(pagination.limit)
        .offset(pagination.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.documents)
        .where(where_clause),
    ]);

    return { data, total: count_result[0].count };
  }

  /**
   * Update a document by ID and return the updated row.
   * @param id - Document UUID.
   * @param data - Partial column values to update.
   * @returns The updated document row, or undefined if not found.
   */
  async update(id: string, data: Partial<typeof schema.documents.$inferInsert>) {
    const rows = await this.db
      .update(schema.documents)
      .set({ ...data, updated_at: new Date() })
      .where(and(eq(schema.documents.id, id), isNull(schema.documents.deleted_at)))
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Soft-delete a document by setting deleted_at.
   * @param id - Document UUID.
   * @param deleted_by_user_id - User performing the deletion.
   * @returns The soft-deleted document row, or undefined.
   */
  async soft_delete(id: string, deleted_by_user_id: string) {
    const rows = await this.db
      .update(schema.documents)
      .set({
        deleted_at: new Date(),
        deleted_by_user_id,
        updated_at: new Date(),
      })
      .where(and(eq(schema.documents.id, id), isNull(schema.documents.deleted_at)))
      .returning();
    return rows[0] ?? null;
  }
}
