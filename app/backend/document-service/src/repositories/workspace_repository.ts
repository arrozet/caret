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
    const rows = await this.db.insert(schema.workspaces).values(data).returning();
    return rows[0];
  }

  /**
   * Find a single non-deleted workspace by slug.
   * @param slug - Workspace slug (case-insensitive via citext).
   * @returns The workspace row, or null if not found / deleted.
   */
  async findBySlug(slug: string) {
    const rows = await this.db
      .select()
      .from(schema.workspaces)
      .where(and(eq(schema.workspaces.slug, slug), isNull(schema.workspaces.deleted_at)));
    return rows[0] ?? null;
  }

  async find_by_slug(slug: string) {
    return this.findBySlug(slug);
  }

  /**
   * Find a single non-deleted workspace by UUID.
   * @param id - Workspace UUID.
   * @returns The workspace row, or null if not found / deleted.
   */
  async findById(id: string) {
    const rows = await this.db
      .select()
      .from(schema.workspaces)
      .where(and(eq(schema.workspaces.id, id), isNull(schema.workspaces.deleted_at)));
    return rows[0] ?? null;
  }

  async find_by_id(id: string) {
    return this.findById(id);
  }

  /**
   * Find the active personal workspace for a user.
   * @param userId - User UUID.
   * @returns The workspace row, or null if the user has no personal workspace.
   */
  async findPersonalByUser(userId: string) {
    const rows = await this.db
      .select({
        id: schema.workspaces.id,
        slug: schema.workspaces.slug,
        name: schema.workspaces.name,
        created_by_user_id: schema.workspaces.created_by_user_id,
        settings: schema.workspaces.settings,
        created_at: schema.workspaces.created_at,
        updated_at: schema.workspaces.updated_at,
      })
      .from(schema.workspace_members)
      .innerJoin(schema.workspaces, eq(schema.workspace_members.workspace_id, schema.workspaces.id))
      .where(
        and(
          eq(schema.workspace_members.user_id, userId),
          isNull(schema.workspace_members.revoked_at),
          isNull(schema.workspaces.deleted_at),
          sql`${schema.workspaces.settings}->>'kind' = 'personal'`,
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async find_personal_by_user(userId: string) {
    return this.findPersonalByUser(userId);
  }

  /**
   * List all workspaces the given user is a non-revoked member of, with pagination.
   * @param user_id - User UUID.
   * @param pagination - Limit and offset for pagination.
   * @returns Object with data array (workspace + role) and total count.
   */
  async listByUser(userId: string, pagination: PaginationParams) {
    const whereClause = and(
      eq(schema.workspace_members.user_id, userId),
      isNull(schema.workspace_members.revoked_at),
      isNull(schema.workspaces.deleted_at),
    );

    const selectFields = {
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

    const [data, countResult] = await Promise.all([
      this.db
        .select(selectFields)
        .from(schema.workspace_members)
        .innerJoin(
          schema.workspaces,
          eq(schema.workspace_members.workspace_id, schema.workspaces.id),
        )
        .where(whereClause)
        .limit(pagination.limit)
        .offset(pagination.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.workspace_members)
        .innerJoin(
          schema.workspaces,
          eq(schema.workspace_members.workspace_id, schema.workspaces.id),
        )
        .where(whereClause),
    ]);

    return { data, total: countResult[0].count };
  }

  async list_by_user(userId: string, pagination: PaginationParams) {
    return this.listByUser(userId, pagination);
  }

  /**
   * Add a member to a workspace.
   * @param data - Membership row values.
   * @returns The inserted membership row.
   */
  async addMember(data: typeof schema.workspace_members.$inferInsert) {
    const rows = await this.db.insert(schema.workspace_members).values(data).returning();
    return rows[0];
  }

  async add_member(data: typeof schema.workspace_members.$inferInsert) {
    return this.addMember(data);
  }

  /**
   * Check whether a user is an active (non-revoked) member of a workspace.
   * @param workspace_id - Workspace UUID.
   * @param user_id - User UUID.
   * @returns The membership row if active, or null.
   */
  async findMembership(workspaceId: string, userId: string) {
    const rows = await this.db
      .select()
      .from(schema.workspace_members)
      .where(
        and(
          eq(schema.workspace_members.workspace_id, workspaceId),
          eq(schema.workspace_members.user_id, userId),
          isNull(schema.workspace_members.revoked_at),
        ),
      );
    return rows[0] ?? null;
  }

  async find_membership(workspaceId: string, userId: string) {
    return this.findMembership(workspaceId, userId);
  }

  /**
   * Check whether a user has any membership row in a workspace,
   * including revoked memberships.
   * @param workspace_id - Workspace UUID.
   * @param user_id - User UUID.
   * @returns The membership row if found, or null.
   */
  async findMembershipAny(workspaceId: string, userId: string) {
    const rows = await this.db
      .select()
      .from(schema.workspace_members)
      .where(
        and(
          eq(schema.workspace_members.workspace_id, workspaceId),
          eq(schema.workspace_members.user_id, userId),
        ),
      );
    return rows[0] ?? null;
  }

  async find_membership_any(workspaceId: string, userId: string) {
    return this.findMembershipAny(workspaceId, userId);
  }

  /**
   * Find a folder by its UUID.
   * @param folderId - Folder UUID.
   * @returns The folder row, or null when not found.
   */
  async findFolderById(folderId: string) {
    const rows = await this.db
      .select()
      .from(schema.folders)
      .where(and(eq(schema.folders.id, folderId), isNull(schema.folders.deleted_at)));
    return rows[0] ?? null;
  }

  async find_folder_by_id(folderId: string) {
    return this.findFolderById(folderId);
  }

  /**
   * Resolve an auth user id by email address (case-insensitive).
   * Reads directly from Supabase `auth.users` as source of truth.
   * @param email - Target email to resolve.
   * @returns Matching user id, or null when not found.
   */
  async findAuthUserIdByEmail(email: string): Promise<string | null> {
    const rows = await this.db.execute(sql<{ id: string }>`
      SELECT id::text AS id
      FROM auth.users
      WHERE lower(email) = lower(${email})
      LIMIT 1
    `);

    const row = rows[0] as { id?: string } | undefined;
    return row?.id ?? null;
  }

  async find_auth_user_id_by_email(email: string): Promise<string | null> {
    return this.findAuthUserIdByEmail(email);
  }

  /**
   * Reactivate a revoked workspace membership and set member metadata.
   * @param workspace_id - Workspace UUID.
   * @param user_id - User UUID.
   * @param invited_by_user_id - User UUID who performed the invite.
   * @returns Updated membership row, or null if no row exists.
   */
  async reactivateMember(workspaceId: string, userId: string, invitedByUserId: string) {
    const rows = await this.db
      .update(schema.workspace_members)
      .set({
        role: "member",
        invited_by_user_id: invitedByUserId,
        revoked_at: null,
        revoked_by_user_id: null,
        joined_at: new Date(),
      })
      .where(
        and(
          eq(schema.workspace_members.workspace_id, workspaceId),
          eq(schema.workspace_members.user_id, userId),
        ),
      )
      .returning();

    return rows[0] ?? null;
  }

  async reactivate_member(workspaceId: string, userId: string, invitedByUserId: string) {
    return this.reactivateMember(workspaceId, userId, invitedByUserId);
  }
}
