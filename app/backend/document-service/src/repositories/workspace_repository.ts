import { eq, and, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import type { PaginationParams } from "../lib/validation.js";

/**
 * Repository for workspace and workspace membership operations.
 * Encapsulates all Drizzle ORM queries against the `workspaces`
 * and `workspace_members` tables.
 */
export class WorkspaceRepository {
  /** Drizzle ORM database client. */
  private db: PostgresJsDatabase<typeof schema>;

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Insert a new workspace and return the created row.
   * @param data - Column values for the new workspace.
   * @returns The inserted workspace row.
   */
  async create(data: typeof schema.workspaces.$inferInsert) {
    const rows = await this.db
      .insert(schema.workspaces)
      .values(data)
      .returning();
    return rows[0];
  }

  /**
   * Find a single non-deleted workspace by slug.
   * @param slug - Workspace slug (case-insensitive via citext).
   * @returns The workspace row, or null if not found / deleted.
   */
  async find_by_slug(slug: string) {
    const rows = await this.db
      .select()
      .from(schema.workspaces)
      .where(and(eq(schema.workspaces.slug, slug), isNull(schema.workspaces.deleted_at)));
    return rows[0] ?? null;
  }

  /**
   * Find a single non-deleted workspace by UUID.
   * @param id - Workspace UUID.
   * @returns The workspace row, or null if not found / deleted.
   */
  async find_by_id(id: string) {
    const rows = await this.db
      .select()
      .from(schema.workspaces)
      .where(and(eq(schema.workspaces.id, id), isNull(schema.workspaces.deleted_at)));
    return rows[0] ?? null;
  }

  /**
   * List all workspaces the given user is a non-revoked member of, with pagination.
   * @param user_id - User UUID.
   * @param pagination - Limit and offset for pagination.
   * @returns Object with data array (workspace + role) and total count.
   */
  async list_by_user(
    user_id: string,
    pagination: PaginationParams,
  ) {
    const where_clause = and(
      eq(schema.workspace_members.user_id, user_id),
      isNull(schema.workspace_members.revoked_at),
      isNull(schema.workspaces.deleted_at),
    );

    const select_fields = {
      id: schema.workspaces.id,
      slug: schema.workspaces.slug,
      name: schema.workspaces.name,
      created_by_user_id: schema.workspaces.created_by_user_id,
      settings: schema.workspaces.settings,
      created_at: schema.workspaces.created_at,
      updated_at: schema.workspaces.updated_at,
      deleted_at: schema.workspaces.deleted_at,
      role: schema.workspace_members.role,
    };

    const [data, count_result] = await Promise.all([
      this.db
        .select(select_fields)
        .from(schema.workspace_members)
        .innerJoin(
          schema.workspaces,
          eq(schema.workspace_members.workspace_id, schema.workspaces.id),
        )
        .where(where_clause)
        .limit(pagination.limit)
        .offset(pagination.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.workspace_members)
        .innerJoin(
          schema.workspaces,
          eq(schema.workspace_members.workspace_id, schema.workspaces.id),
        )
        .where(where_clause),
    ]);

    return { data, total: count_result[0].count };
  }

  /**
   * Add a member to a workspace.
   * @param data - Membership row values.
   * @returns The inserted membership row.
   */
  async add_member(data: typeof schema.workspace_members.$inferInsert) {
    const rows = await this.db
      .insert(schema.workspace_members)
      .values(data)
      .returning();
    return rows[0];
  }

  /**
   * Check whether a user is an active (non-revoked) member of a workspace.
   * @param workspace_id - Workspace UUID.
   * @param user_id - User UUID.
   * @returns The membership row if active, or null.
   */
  async find_membership(workspace_id: string, user_id: string) {
    const rows = await this.db
      .select()
      .from(schema.workspace_members)
      .where(
        and(
          eq(schema.workspace_members.workspace_id, workspace_id),
          eq(schema.workspace_members.user_id, user_id),
          isNull(schema.workspace_members.revoked_at),
        ),
      );
    return rows[0] ?? null;
  }
}
