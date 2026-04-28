import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import type { PaginationParams } from "../lib/validation.js";
import { DocumentRepository } from "./document_repository.js";
import { DocumentMemberRepository } from "./document_member_repository.js";

type DatabaseExecutor = PostgresJsDatabase<typeof schema>;

/**
 * Repository for folder CRUD operations.
 * Encapsulates all Drizzle ORM queries against the `folders` table.
 * Receives the db client via constructor injection.
 */
export class FolderRepository {
  /** Drizzle ORM database client. */
  private db: DatabaseExecutor;

  constructor(db: DatabaseExecutor) {
    this.db = db;
  }

  /**
   * Run a callback inside a single database transaction and expose transaction-scoped repositories.
   * @param callback - Unit of work to execute atomically.
   * @returns Callback result.
   */
  async withTransaction<T>(
    callback: (repositories: {
      folderRepository: FolderRepository;
      documentRepository: DocumentRepository;
      documentMemberRepository: DocumentMemberRepository;
    }) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (transaction) => {
      const transactionDb = transaction as DatabaseExecutor;

      return callback({
        folderRepository: new FolderRepository(transactionDb),
        documentRepository: new DocumentRepository(transactionDb),
        documentMemberRepository: new DocumentMemberRepository(transactionDb),
      });
    });
  }

  async with_transaction<T>(
    callback: (repositories: {
      folderRepository: FolderRepository;
      documentRepository: DocumentRepository;
      documentMemberRepository: DocumentMemberRepository;
    }) => Promise<T>,
  ) {
    return this.withTransaction(callback);
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
   * Find the IDs of a folder subtree, including the root folder itself.
   * Deleted folders are excluded from the traversal.
   * @param folderId - Root folder UUID.
   * @returns Ordered list of active folder IDs in the subtree.
   */
  async findDescendantIds(folderId: string): Promise<string[]> {
    const result = await this.db.execute(sql<{ id: string }>`
      WITH RECURSIVE folder_tree AS (
        SELECT id, parent_folder_id
        FROM ${schema.folders}
        WHERE ${schema.folders.id} = ${folderId}
          AND ${schema.folders.deleted_at} IS NULL

        UNION ALL

        SELECT child.id, child.parent_folder_id
        FROM ${schema.folders} AS child
        INNER JOIN folder_tree ON child.parent_folder_id = folder_tree.id
        WHERE child.deleted_at IS NULL
      )
      SELECT id FROM folder_tree
    `);

    return result.map((row) => row.id as string);
  }

  async find_descendant_ids(folderId: string) {
    return this.findDescendantIds(folderId);
  }

  /**
   * Find active folder IDs that belong to the provided workspace.
   * @param workspaceId - Workspace UUID.
   * @returns Folder UUIDs.
   */
  async findIdsByWorkspaceId(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.folders.id })
      .from(schema.folders)
      .where(and(eq(schema.folders.workspace_id, workspaceId), isNull(schema.folders.deleted_at)));

    return rows.map((row) => row.id);
  }

  async find_ids_by_workspace_id(workspaceId: string) {
    return this.findIdsByWorkspaceId(workspaceId);
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

  /**
   * Soft-delete multiple folders in one operation.
   * @param folderIds - Folder UUIDs to mark as deleted.
   * @returns Number of folders updated.
   */
  async softDeleteMany(folderIds: string[]): Promise<number> {
    if (folderIds.length === 0) {
      return 0;
    }

    const rows = await this.db
      .update(schema.folders)
      .set({
        deleted_at: new Date(),
        updated_at: new Date(),
      })
      .where(and(inArray(schema.folders.id, folderIds), isNull(schema.folders.deleted_at)))
      .returning({ id: schema.folders.id });

    return rows.length;
  }

  async soft_delete_many(folderIds: string[]) {
    return this.softDeleteMany(folderIds);
  }
}
