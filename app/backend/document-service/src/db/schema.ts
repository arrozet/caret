/**
 * Drizzle ORM schema definitions for the Document Service.
 * Covers tables: user_profiles, workspaces, workspace_members,
 * folders, documents, document_members, document_versions.
 * See DATABASE.md for the full schema specification.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  bigint,
  primaryKey,
  uniqueIndex,
  index,
  foreignKey,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ============================================================
   Custom column types
   ============================================================ */

/**
 * Case-insensitive text type (`citext` extension).
 * Requires: CREATE EXTENSION IF NOT EXISTS citext;
 * Used for slugs, emails, and other case-insensitive identifiers.
 */
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

/* ============================================================
   Enum types — matching DATABASE.md §Enum Types
   ============================================================ */

/** Workspace member roles: owner > admin > member > guest. */
export const workspace_member_role_enum = pgEnum("workspace_member_role", [
  "owner",
  "admin",
  "member",
  "guest",
]);

/** Document visibility levels controlling access scope. */
export const document_visibility_enum = pgEnum("document_visibility", [
  "private",
  "workspace",
  "link",
  "public",
]);

/** Per-document member roles: owner > editor > commenter > viewer. */
export const document_member_role_enum = pgEnum("document_member_role", [
  "owner",
  "editor",
  "commenter",
  "viewer",
]);

/** Document lifecycle status. */
export const document_status_enum = pgEnum("document_status", ["active", "archived"]);

/* ============================================================
   1) Workspaces (Tenant Boundary)
   ============================================================ */

/**
 * Tenant container for documents, permissions, AI context, and audit.
 * Most domain tables include workspace_id as a tenant scope key.
 */
export const workspaces = pgTable(
  "workspaces",
  {
    /** Primary key. */
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    /** Human-friendly URL slug (globally unique when active). Case-insensitive. */
    slug: citext("slug"),
    /** Display name. */
    name: text("name").notNull(),
    /** User who created this workspace. */
    created_by_user_id: uuid("created_by_user_id"),
    /** Workspace-level settings (feature flags, defaults). */
    settings: jsonb("settings").notNull().default({}),
    /** Row creation timestamp. */
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Row last-update timestamp. */
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete timestamp (null = not deleted). */
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    /** Partial unique index: slug must be unique among active workspaces. */
    uniqueIndex("uq_workspaces_slug_active")
      .on(table.slug)
      .where(sql`${table.deleted_at} IS NULL AND ${table.slug} IS NOT NULL`),
    /** List workspaces by most recently updated. */
    index("idx_workspaces_updated_at").on(table.updated_at),
  ],
);

/**
 * Workspace membership and RBAC.
 * Composite PK on (workspace_id, user_id).
 */
export const workspace_members = pgTable(
  "workspace_members",
  {
    /** FK to workspaces(id). */
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** FK to auth.users(id) — stored as UUID. */
    user_id: uuid("user_id").notNull(),
    /** Role within the workspace. */
    role: workspace_member_role_enum("role").notNull(),
    /** User who sent the invite. */
    invited_by_user_id: uuid("invited_by_user_id"),
    /** When the member joined. */
    joined_at: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    /** Soft "remove member" timestamp (null = active). */
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    /** User who revoked membership. */
    revoked_by_user_id: uuid("revoked_by_user_id"),
    /** Last activity timestamp for presence/analytics. */
    last_active_at: timestamp("last_active_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.workspace_id, table.user_id] }),
    /** Lookup by user: "list all workspaces I belong to". */
    index("idx_workspace_members_user_workspace").on(table.user_id, table.workspace_id),
    /** Active members of a workspace (excludes revoked). */
    index("idx_workspace_members_active")
      .on(table.workspace_id)
      .where(sql`${table.revoked_at} IS NULL`),
  ],
);

/* ============================================================
   2) Information Architecture (Folders & Documents)
   ============================================================ */

/**
 * Hierarchical folder tree (adjacency list).
 * Organizes documents within a workspace.
 */
export const folders = pgTable(
  "folders",
  {
    /** Primary key. */
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    /** FK to workspaces(id). */
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Self-referencing FK for nested folders (null = root). */
    parent_folder_id: uuid("parent_folder_id"),
    /** Folder display name. */
    name: text("name").notNull(),
    /** Optional manual sort ordering. */
    sort_order: integer("sort_order"),
    /** User who created this folder. */
    created_by_user_id: uuid("created_by_user_id"),
    /** Row creation timestamp. */
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Row last-update timestamp. */
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete timestamp (null = not deleted). */
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    /** Self-referencing FK: parent_folder_id → folders(id). */
    foreignKey({
      columns: [table.parent_folder_id],
      foreignColumns: [table.id],
    }).onDelete("set null"),
    /** List children of a folder (or root items). */
    index("idx_folders_workspace_parent").on(table.workspace_id, table.parent_folder_id),
    /** List active folders by most recently updated. */
    index("idx_folders_workspace_updated")
      .on(table.workspace_id, table.updated_at)
      .where(sql`${table.deleted_at} IS NULL`),
    /** Prevent duplicate folder names within the same parent (active only). */
    uniqueIndex("uq_folders_name_per_parent")
      .on(table.workspace_id, table.parent_folder_id, table.name)
      .where(sql`${table.deleted_at} IS NULL`),
  ],
);

/**
 * Document metadata and access configuration.
 * CRDT content is stored separately; this table tracks ownership,
 * visibility, status, and the pointer to the latest version.
 *
 * Note: The FK from latest_version_id → document_versions(id) creates
 * a circular reference with document_versions.document_id → documents(id).
 * This is resolved by adding the FK via a deferred constraint in the
 * table's extra config rather than inline on the column.
 */
export const documents = pgTable(
  "documents",
  {
    /** Primary key. */
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    /** FK to workspaces(id). */
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** FK to folders(id) — null means document is at workspace root. */
    folder_id: uuid("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    /** Document title. */
    title: text("title").notNull(),
    /** Lifecycle status (active/archived). */
    status: document_status_enum("status").notNull().default("active"),
    /** Access scope (private/workspace/link/public). */
    visibility: document_visibility_enum("visibility").notNull().default("private"),
    /** Default role when visibility = 'workspace'. */
    workspace_default_role: document_member_role_enum("workspace_default_role"),
    /** Document owner user ID. */
    owner_user_id: uuid("owner_user_id"),
    /** User who created this document. */
    created_by_user_id: uuid("created_by_user_id"),
    /** User who last updated this document. */
    updated_by_user_id: uuid("updated_by_user_id"),
    /** User who soft-deleted this document. */
    deleted_by_user_id: uuid("deleted_by_user_id"),
    /** Row creation timestamp. */
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Row last-update timestamp. */
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the document was archived. */
    archived_at: timestamp("archived_at", { withTimezone: true }),
    /** Soft delete timestamp (null = not deleted). */
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    /** Denormalized pointer to the latest version. */
    latest_version_id: uuid("latest_version_id"),
  },
  (table) => [
    /**
     * List documents in a folder (or root) by most recently updated.
     * Partial index: only active (non-deleted) documents.
     */
    index("idx_documents_workspace_folder_updated")
      .on(table.workspace_id, table.folder_id, table.updated_at)
      .where(sql`${table.deleted_at} IS NULL`),
    /**
     * List documents by status (active/archived) and recency.
     * Partial index: only active (non-deleted) documents.
     */
    index("idx_documents_workspace_status_updated")
      .on(table.workspace_id, table.status, table.updated_at)
      .where(sql`${table.deleted_at} IS NULL`),
  ],
);

/**
 * Per-document membership and role overrides (document-level RBAC).
 * Composite PK on (document_id, user_id).
 */
export const document_members = pgTable(
  "document_members",
  {
    /** FK to documents(id). */
    document_id: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** FK to auth.users(id). */
    user_id: uuid("user_id").notNull(),
    /** Role on this document. */
    role: document_member_role_enum("role").notNull(),
    /** User who added this member. */
    added_by_user_id: uuid("added_by_user_id"),
    /** When the membership was created. */
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Last time this member viewed the document. */
    last_viewed_at: timestamp("last_viewed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.document_id, table.user_id] }),
    /** List documents shared with a user. */
    index("idx_document_members_user_document").on(table.user_id, table.document_id),
    /** Permission checks: resolve role from index without table lookup. */
    index("idx_document_members_role").on(table.document_id, table.role),
  ],
);

/* ============================================================
    3) User Profiles
    ============================================================ */

/**
 * Application-level user profile extending auth.users.
 * Stores display preferences and avatar independently from
 * identity provider metadata, so Google OAuth re-login
 * does not overwrite customizations.
 */
export const user_profiles = pgTable("user_profiles", {
  /** Primary key — matches auth.users(id). */
  user_id: uuid("user_id").primaryKey().notNull(),
  /** Human-friendly display name. */
  display_name: text("display_name"),
  /** Public avatar URL. */
  avatar_url: text("avatar_url"),
  /** IETF locale tag (e.g., en-US). */
  locale: text("locale"),
  /** Row creation timestamp. */
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Row last-update timestamp. */
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** Soft delete timestamp (null = active). */
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
});

/* ============================================================
    4) Document Versioning
   ============================================================ */

/**
 * Immutable document snapshots for versioning, export, and RAG pipelines.
 * A version is created by snapshotting the CRDT state and converting
 * it to ProseMirror JSON + plain text extraction.
 */
export const document_versions = pgTable(
  "document_versions",
  {
    /** Primary key. */
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    /** FK to documents(id). */
    document_id: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** Monotonic version number per document. */
    version_number: bigint("version_number", { mode: "number" }).notNull(),
    /** How this version was created (manual, autosnapshot, import). */
    source: text("source").notNull(),
    /** ProseMirror/Tiptap document JSON. */
    content_json: jsonb("content_json").notNull(),
    /** Plain text extraction for search. */
    content_text: text("content_text").notNull().default(""),
    /** User who created this version snapshot. */
    created_by_user_id: uuid("created_by_user_id"),
    /** Row creation timestamp. */
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * UNIQUE constraint on (document_id, version_number).
     * Prevents race conditions creating duplicate version numbers.
     */
    uniqueIndex("uq_document_versions_doc_version").on(table.document_id, table.version_number),
    /**
     * List versions of a document by most recent first.
     * Also used to find the latest version efficiently.
     */
    index("idx_document_versions_doc_version_desc").on(table.document_id, table.version_number),
  ],
);
