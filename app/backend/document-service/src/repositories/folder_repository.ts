import { eq, and, isNull, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";

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
    const rows = await this.db
      .insert(schema.folders)
      .values(data)
      .returning();
    return rows[0];
  }

  /**
   * Find a single non-deleted folder by its UUID.
   * @param id - Folder UUID.
   * @returns The folder row, or null if not found / deleted.
   */
  async find_by_id(id: string) {
    const rows = await this.db
      .select()
      .from(schema.folders)
      .where(
        and(eq(schema.folders.id, id), isNull(schema.folders.deleted_at)),
      );
    return rows[0] ?? null;
  }

  /**
   * List all non-deleted folders in a workspace, optionally filtered by parent.
   * Results are ordered by sort_order (nulls last), then by name.
   * @param workspace_id - Workspace UUID scope.
   * @param parent_folder_id - Parent folder UUID (null = list root folders).
   * @returns Array of folder rows.
   */
  async list_by_workspace(
    workspace_id: string,
    parent_folder_id: string | null = null,
  ) {
    const conditions = [
      eq(schema.folders.workspace_id, workspace_id),
      isNull(schema.folders.deleted_at),
    ];

    if (parent_folder_id === null) {
      conditions.push(isNull(schema.folders.parent_folder_id));
    } else {
      conditions.push(
        eq(schema.folders.parent_folder_id, parent_folder_id),
      );
    }

    return this.db
      .select()
      .from(schema.folders)
      .where(and(...conditions))
      .orderBy(schema.folders.sort_order, schema.folders.name);
  }

  /**
   * List all non-deleted folders in a workspace (flat list, no parent filter).
   * Useful for building tree structures on the client.
   * @param workspace_id - Workspace UUID scope.
   * @returns Array of all folder rows in the workspace.
   */
  async list_all_by_workspace(workspace_id: string) {
    return this.db
      .select()
      .from(schema.folders)
      .where(
        and(
          eq(schema.folders.workspace_id, workspace_id),
          isNull(schema.folders.deleted_at),
        ),
      )
      .orderBy(schema.folders.sort_order, schema.folders.name);
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
      .where(
        and(eq(schema.folders.id, id), isNull(schema.folders.deleted_at)),
      )
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Soft-delete a folder by setting deleted_at.
   * @param id - Folder UUID.
   * @returns The soft-deleted folder row, or null.
   */
  async soft_delete(id: string) {
    const rows = await this.db
      .update(schema.folders)
      .set({
        deleted_at: new Date(),
        updated_at: new Date(),
      })
      .where(
        and(eq(schema.folders.id, id), isNull(schema.folders.deleted_at)),
      )
      .returning();
    return rows[0] ?? null;
  }
}
