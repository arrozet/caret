import { eq, and, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import type { PaginationParams } from "../lib/validation.js";

/**
 * Repository for folder CRUD operations.
 * Encapsulates all Drizzle ORM queries against the `folders` table.
 * Receives the db client via constructor injection.
 */
export class FolderRepository {
  /** Drizzle ORM database client. */
  private db: PostgresJsDatabase<typeof schema>;

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Insert a new folder row and return the created record.
   * @param data - Column values for the new folder.
   * @returns The inserted folder row.
   */
  async create(data: typeof schema.folders.$inferInsert) {
    const rows = await this.db.insert(schema.folders).values(data).returning();
    return rows[0];
  }

  /**
   * Find a single non-deleted folder by its UUID.
   * @param id - Folder UUID.
   * @returns The folder row, or null if not found / deleted.
   */
  async findById(id: string) {
    const rows = await this.db
      .select()
      .from(schema.folders)
      .where(and(eq(schema.folders.id, id), isNull(schema.folders.deleted_at)));
    return rows[0] ?? null;
  }

  async find_by_id(id: string) {
    return this.findById(id);
  }

  /**
   * List non-deleted folders in a workspace with pagination, optionally filtered by parent.
   * Results are ordered by sort_order (nulls last), then by name.
   * @param workspace_id - Workspace UUID scope.
   * @param parent_folder_id - Parent folder UUID (null = list root folders).
   * @param pagination - Limit and offset for pagination.
   * @returns Object with data array and total count.
   */
  async listByWorkspace(
    workspaceId: string,
    parentFolderId: string | null = null,
    pagination: PaginationParams,
  ): Promise<{ data: (typeof schema.folders.$inferSelect)[]; total: number }> {
    const conditions = [
      eq(schema.folders.workspace_id, workspaceId),
      isNull(schema.folders.deleted_at),
    ];

    if (parentFolderId === null) {
      conditions.push(isNull(schema.folders.parent_folder_id));
    } else {
      conditions.push(eq(schema.folders.parent_folder_id, parentFolderId));
    }

    const whereClause = and(...conditions);

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(schema.folders)
        .where(whereClause)
        .orderBy(schema.folders.sort_order, schema.folders.name)
        .limit(pagination.limit)
        .offset(pagination.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.folders)
        .where(whereClause),
    ]);

    return { data, total: countResult[0].count };
  }

  async list_by_workspace(
    workspaceId: string,
    parentFolderId: string | null = null,
    pagination: PaginationParams,
  ) {
    return this.listByWorkspace(workspaceId, parentFolderId, pagination);
  }

  /**
   * List all non-deleted folders in a workspace with pagination (flat list, no parent filter).
   * Useful for building tree structures on the client.
   * @param workspace_id - Workspace UUID scope.
   * @param pagination - Limit and offset for pagination.
   * @returns Object with data array and total count.
   */
  async listAllByWorkspace(
    workspaceId: string,
    pagination: PaginationParams,
  ): Promise<{ data: (typeof schema.folders.$inferSelect)[]; total: number }> {
    const whereClause = and(
      eq(schema.folders.workspace_id, workspaceId),
      isNull(schema.folders.deleted_at),
    );

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(schema.folders)
        .where(whereClause)
        .orderBy(schema.folders.sort_order, schema.folders.name)
        .limit(pagination.limit)
        .offset(pagination.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.folders)
        .where(whereClause),
    ]);

    return { data, total: countResult[0].count };
  }

  async list_all_by_workspace(workspaceId: string, pagination: PaginationParams) {
    return this.listAllByWorkspace(workspaceId, pagination);
  }

  /**
   * Update a folder by ID and return the updated row.
   * @param id - Folder UUID.
   * @param data - Partial column values to update.
   * @returns The updated folder row, or null if not found.
   */
  async update(id: string, data: Partial<typeof schema.folders.$inferInsert>) {
    const rows = await this.db
      .update(schema.folders)
      .set({ ...data, updated_at: new Date() })
      .where(and(eq(schema.folders.id, id), isNull(schema.folders.deleted_at)))
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Soft-delete a folder by setting deleted_at.
   * @param id - Folder UUID.
   * @returns The soft-deleted folder row, or null.
   */
  async softDelete(id: string) {
    const rows = await this.db
      .update(schema.folders)
      .set({
        deleted_at: new Date(),
        updated_at: new Date(),
      })
      .where(and(eq(schema.folders.id, id), isNull(schema.folders.deleted_at)))
      .returning();
    return rows[0] ?? null;
  }

  async soft_delete(id: string) {
    return this.softDelete(id);
  }
}
