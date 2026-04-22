import { eq, and, isNull, sql, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import type { PaginationParams } from "../lib/validation.js";

/**
 * Repository for per-document membership operations.
 * Encapsulates all Drizzle ORM queries against the `document_members` table.
 */
export class DocumentMemberRepository {
  /** Drizzle ORM database client. */
  private db: PostgresJsDatabase<typeof schema>;

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Add a member to a document.
   * @param data - Membership row values.
   * @returns The inserted membership row.
   */
  async addMember(data: typeof schema.document_members.$inferInsert) {
    const rows = await this.db.insert(schema.document_members).values(data).returning();
    return rows[0];
  }

  /**
   * Check whether a user is an active member of a document.
   * @param documentId - Document UUID.
   * @param userId - User UUID.
   * @returns The membership row if present, or null.
   */
  async findMembership(documentId: string, userId: string) {
    const rows = await this.db
      .select()
      .from(schema.document_members)
      .where(
        and(
          eq(schema.document_members.document_id, documentId),
          eq(schema.document_members.user_id, userId),
        ),
      );
    return rows[0] ?? null;
  }

  /**
   * List documents directly shared with a user.
   * @param userId - User UUID.
   * @param pagination - Limit and offset for pagination.
   */
  async listByUser(userId: string, pagination: PaginationParams) {
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
        .orderBy(desc(schema.documents.updated_at))
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
}
