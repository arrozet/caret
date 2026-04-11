import { eq, desc, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import type { PaginationParams } from "../lib/validation.js";

/**
 * Repository for document version snapshot operations.
 * Encapsulates all Drizzle ORM queries against the `document_versions` table.
 */
export class DocumentVersionRepository {
  /** Drizzle ORM database client. */
  private db: PostgresJsDatabase<typeof schema>;

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Insert a new document version snapshot and return the created row.
   * @param data - Column values for the new version.
   * @returns The inserted version row.
   */
  async create(data: typeof schema.document_versions.$inferInsert) {
    const rows = await this.db.insert(schema.document_versions).values(data).returning();
    return rows[0];
  }

  /**
   * Find the latest version of a document (highest version_number).
   * @param document_id - Document UUID.
   * @returns The latest version row, or null if none exist.
   */
  async findLatest(documentId: string) {
    const rows = await this.db
      .select()
      .from(schema.document_versions)
      .where(eq(schema.document_versions.document_id, documentId))
      .orderBy(desc(schema.document_versions.version_number))
      .limit(1);
    return rows[0] ?? null;
  }

  async find_latest(documentId: string) {
    return this.findLatest(documentId);
  }

  /**
   * List versions for a document with pagination, ordered by newest first.
   * @param document_id - Document UUID.
   * @param pagination - Limit and offset for pagination.
   * @returns Object with data array and total count.
   */
  async listByDocument(
    documentId: string,
    pagination: PaginationParams,
  ): Promise<{ data: (typeof schema.document_versions.$inferSelect)[]; total: number }> {
    const whereClause = eq(schema.document_versions.document_id, documentId);

    const [data, count_result] = await Promise.all([
      this.db
        .select()
        .from(schema.document_versions)
        .where(whereClause)
        .orderBy(desc(schema.document_versions.version_number))
        .limit(pagination.limit)
        .offset(pagination.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.document_versions)
        .where(whereClause),
    ]);

    return { data, total: count_result[0].count };
  }

  async list_by_document(documentId: string, pagination: PaginationParams) {
    return this.listByDocument(documentId, pagination);
  }
}
