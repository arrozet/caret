import { eq, and, inArray, isNull, desc, sql } from "drizzle-orm";
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
    const rows = await this.db.insert(schema.documents).values(data).returning();
    return rows[0];
  }

  /**
   * Find a single non-deleted document by its UUID.
   * @param id - Document UUID.
   * @returns The document row, or undefined if not found / deleted.
   */
  async findById(id: string) {
    const rows = await this.db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.id, id), isNull(schema.documents.deleted_at)));
    return rows[0] ?? null;
  }

  async find_by_id(id: string) {
    return this.findById(id);
  }

  /**
   * List non-deleted documents in a workspace with pagination, ordered by most recently updated.
   * @param workspace_id - Workspace UUID scope.
   * @param pagination - Limit and offset for pagination.
   * @returns Object with data array and total count.
   */
  async listByWorkspace(
    workspaceId: string,
    pagination: PaginationParams,
  ): Promise<{ data: (typeof schema.documents.$inferSelect)[]; total: number }> {
    const whereClause = and(
      eq(schema.documents.workspace_id, workspaceId),
      isNull(schema.documents.deleted_at),
    );

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(schema.documents)
        .where(whereClause)
        .orderBy(desc(schema.documents.updated_at))
        .limit(pagination.limit)
        .offset(pagination.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.documents)
        .where(whereClause),
    ]);

    return { data, total: countResult[0].count };
  }

  async list_by_workspace(workspaceId: string, pagination: PaginationParams) {
    return this.listByWorkspace(workspaceId, pagination);
  }

  /**
   * List documents directly shared with a user, excluding workspace shares.
   * @param userId - User UUID.
   * @param pagination - Limit and offset for pagination.
   */
  async listSharedWithUser(userId: string, pagination: PaginationParams) {
    const whereClause = and(
      eq(schema.document_members.user_id, userId),
      isNull(schema.documents.deleted_at),
    );

    const selectFields = {
      id: schema.documents.id,
      workspace_id: schema.documents.workspace_id,
      folder_id: schema.documents.folder_id,
      title: schema.documents.title,
      status: schema.documents.status,
      visibility: schema.documents.visibility,
      owner_user_id: schema.documents.owner_user_id,
      created_at: schema.documents.created_at,
      updated_at: schema.documents.updated_at,
      role: schema.document_members.role,
    };

    const [data, countResult] = await Promise.all([
      this.db
        .select(selectFields)
        .from(schema.document_members)
        .innerJoin(schema.documents, eq(schema.document_members.document_id, schema.documents.id))
        .where(whereClause)
        .limit(pagination.limit)
        .offset(pagination.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.document_members)
        .innerJoin(schema.documents, eq(schema.document_members.document_id, schema.documents.id))
        .where(whereClause),
    ]);

    return { data, total: countResult[0].count };
  }

  async list_shared_with_user(userId: string, pagination: PaginationParams) {
    return this.listSharedWithUser(userId, pagination);
  }

  /**
   * Find active document IDs that belong to any of the provided folders.
   * @param folderIds - Folder UUIDs.
   * @returns Document UUIDs.
   */
  async findIdsByFolderIds(folderIds: string[]): Promise<string[]> {
    if (folderIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(
        and(inArray(schema.documents.folder_id, folderIds), isNull(schema.documents.deleted_at)),
      );

    return rows.map((row) => row.id);
  }

  async find_ids_by_folder_ids(folderIds: string[]) {
    return this.findIdsByFolderIds(folderIds);
  }

  /**
   * Find an active document by its title within a specific folder/workspace.
   * @param workspaceId - Workspace UUID.
   * @param folderId - Folder UUID (null = root level).
   * @param title - Document title.
   * @param excludeDocumentId - Optional document ID to exclude from matches.
   * @returns The matching document row, or null.
   */
  async findByTitleInFolder(
    workspaceId: string,
    folderId: string | null,
    title: string,
    excludeDocumentId?: string,
  ) {
    const conditions = sql`workspace_id = ${workspaceId}
      AND folder_id IS NOT DISTINCT FROM ${folderId}
      AND title = ${title}
      AND deleted_at IS NULL`;
    if (excludeDocumentId) {
      conditions.append(sql` AND id != ${excludeDocumentId}`);
    }
    const rows = await this.db.select().from(schema.documents).where(conditions).limit(1);
    return rows[0] ?? null;
  }

  async find_by_title_in_folder(
    workspaceId: string,
    folderId: string | null,
    title: string,
    excludeDocumentId?: string,
  ) {
    return this.findByTitleInFolder(workspaceId, folderId, title, excludeDocumentId);
  }

  /**
   * Find active document IDs that belong to the provided workspace.
   * @param workspaceId - Workspace UUID.
   * @returns Document UUIDs.
   */
  async findIdsByWorkspaceId(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(
        and(eq(schema.documents.workspace_id, workspaceId), isNull(schema.documents.deleted_at)),
      );

    return rows.map((row) => row.id);
  }

  async find_ids_by_workspace_id(workspaceId: string) {
    return this.findIdsByWorkspaceId(workspaceId);
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
  async softDelete(id: string, deletedByUserId: string) {
    const rows = await this.db
      .update(schema.documents)
      .set({
        deleted_at: new Date(),
        deleted_by_user_id: deletedByUserId,
        updated_at: new Date(),
      })
      .where(and(eq(schema.documents.id, id), isNull(schema.documents.deleted_at)))
      .returning();
    return rows[0] ?? null;
  }

  async soft_delete(id: string, deletedByUserId: string) {
    return this.softDelete(id, deletedByUserId);
  }

  /**
   * Soft-delete multiple documents in one operation.
   * @param documentIds - Document UUIDs to mark as deleted.
   * @param deletedByUserId - User performing the deletion.
   * @returns Number of documents updated.
   */
  async softDeleteMany(documentIds: string[], deletedByUserId: string): Promise<number> {
    if (documentIds.length === 0) {
      return 0;
    }

    const rows = await this.db
      .update(schema.documents)
      .set({
        deleted_at: new Date(),
        deleted_by_user_id: deletedByUserId,
        updated_at: new Date(),
      })
      .where(and(inArray(schema.documents.id, documentIds), isNull(schema.documents.deleted_at)))
      .returning({ id: schema.documents.id });

    return rows.length;
  }

  async soft_delete_many(documentIds: string[], deletedByUserId: string) {
    return this.softDeleteMany(documentIds, deletedByUserId);
  }
}
