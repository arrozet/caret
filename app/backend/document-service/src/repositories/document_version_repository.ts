import { eq, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";

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
    const rows = await this.db
      .insert(schema.document_versions)
      .values(data)
      .returning();
    return rows[0];
  }

  /**
   * Find the latest version of a document (highest version_number).
   * @param document_id - Document UUID.
   * @returns The latest version row, or null if none exist.
   */
  async find_latest(document_id: string) {
    const rows = await this.db
      .select()
      .from(schema.document_versions)
      .where(eq(schema.document_versions.document_id, document_id))
      .orderBy(desc(schema.document_versions.version_number))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * List all versions for a document, ordered by newest first.
   * @param document_id - Document UUID.
   * @returns Array of version rows.
   */
  async list_by_document(document_id: string) {
    return this.db
      .select()
      .from(schema.document_versions)
      .where(eq(schema.document_versions.document_id, document_id))
      .orderBy(desc(schema.document_versions.version_number));
  }
}
