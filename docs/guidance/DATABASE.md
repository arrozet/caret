# Caret - Database Schema & Architecture

## Overview

Caret uses **PostgreSQL** (via Supabase) as its primary database with **pgvector** extension for semantic search and AI context retrieval. This document specifies the complete database schema designed to support authentication, document management, real-time collaboration (Y.js CRDT), AI-powered features (RAG), and multi-user permissions.

This is a **schema specification**, not a set of SQL migration scripts. It focuses on:

- Table and column definitions (types, nullability, defaults)
- Primary keys, foreign keys, uniqueness constraints, and validation checks
- **Required** indexes implied by constraints
- **Suggested/optional** indexes, partitioning, and RLS guidance for production scalability

## Design Principles

- **Normalization**: Third Normal Form (3NF) to minimize redundancy
- **Scalability**: Partitioning strategies for high-volume tables
- **Performance**: Strategic indexing (B-tree, HNSW, GIN) for query optimization
- **Security**: Row Level Security (RLS) policies for tenant isolation
- **Audit Trail**: Timestamps and soft deletes for data recovery
- **Referential Integrity**: Foreign keys with appropriate cascade rules
- **Type Safety**: Use of ENUMs and CHECK constraints for data validation

## Scope & Assumptions

- **Identity**: Supabase Auth is the source of truth for users (`auth.users`).
- **Application schema**: All application tables live in `public` (unless otherwise stated).
- **Multi-tenancy**: A `workspace` is the primary tenant. Most domain tables include `workspace_id`.
- **Document consistency**: Document content is synchronized via **Y.js CRDT**. The AI service **never** writes document state directly; it streams suggestions to the frontend which applies CRDT-compatible edits.
- **Soft deletes**: Most domain tables use `deleted_at` for logical deletion. Queries should default to `deleted_at IS NULL`.

## Conventions (Required)

### Naming

- **Tables / columns**: `snake_case`
- **Tables**: plural nouns (e.g., `documents`, `workspaces`)
- **Foreign keys**: `<referenced_table_singular>_id` (e.g., `workspace_id`, `document_id`)

### Primary keys

- Use `uuid` primary keys with server-side generation (Supabase typically uses `gen_random_uuid()` from `pgcrypto`).
- Prefer **composite primary keys** only for pure join tables where it improves query simplicity (e.g., `(workspace_id, user_id)`).

### Timestamps and time zones

- Use `timestamptz` for all timestamps.
- Standard columns:
  - `created_at` (required)
  - `updated_at` (required; maintained via app or trigger)
  - `deleted_at` (optional; null means “not deleted”)

### Soft delete pattern

- When uniqueness must ignore deleted records, use **partial unique indexes** (suggested) such as `UNIQUE (...) WHERE deleted_at IS NULL`.

## PostgreSQL Extensions

### Required

- **`pgcrypto`**: UUID generation (`gen_random_uuid()`)
- **`vector`** (pgvector): vector storage and ANN indexes (HNSW/IVFFLAT)
- **`citext`**: case-insensitive text for emails/slugs
- **`pg_trgm`**: trigram search for titles/names
- **`pg_stat_statements`**: query observability

### Suggested (Optional)

- **`btree_gin`**: combined GIN indexes where useful

## Enum Types (Schema-Level Types)

These are recommended as PostgreSQL `ENUM` types (or alternatively `TEXT + CHECK` constraints if you prefer easier migrations).

- **`workspace_member_role`**: `owner`, `admin`, `member`, `guest`
- **`document_visibility`**: `private`, `workspace`, `link`, `public`
- **`document_member_role`**: `owner`, `editor`, `commenter`, `viewer`
- **`document_status`**: `active`, `archived`
- **`ai_conversation_status`**: `active`, `archived`
- **`ai_message_role`**: `system`, `user`, `assistant`, `tool`
- **`ai_suggestion_status`**: `proposed`, `applied`, `dismissed`, `superseded`
- **`audit_event_severity`**: `info`, `warning`, `error`
- **`job_status`** (optional): `queued`, `running`, `succeeded`, `failed`, `cancelled`

## Core Tables (Required)

### 1) Users & Profiles

#### `user_profiles`

**Purpose**: Application-level profile data for a Supabase user.

**Primary key**: `user_id` (same as `auth.users.id`)

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `user_id` | `uuid` | NO |  | FK → `auth.users(id)` |
| `display_name` | `text` | YES |  | Human-friendly name |
| `avatar_url` | `text` | YES |  | URL (e.g., Supabase Storage public URL) |
| `locale` | `text` | YES |  | IETF tag (e.g., `en-US`) |
| `created_at` | `timestamptz` | NO | `now()` |  |
| `updated_at` | `timestamptz` | NO | `now()` |  |
| `deleted_at` | `timestamptz` | YES |  | Soft delete (rare) |

**Constraints**

- PK: (`user_id`)
- FK: (`user_id`) → `auth.users(id)` **ON DELETE CASCADE**

**Indexes**

- None required beyond the primary key. Optional: add `btree(updated_at DESC)` only if the app lists or sorts profiles by `updated_at`; otherwise omit.

---

### 2) Workspaces (Tenant Boundary)

#### `workspaces`

**Purpose**: Tenant container for documents, permissions, AI context, and audit.

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `id` | `uuid` | NO |  | PK |
| `slug` | `citext` (or `text`) | YES |  | Human-friendly identifier; keep globally unique or unique per user/org |
| `name` | `text` | NO |  | Display name |
| `created_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `settings` | `jsonb` | NO | `'{}'` | Workspace-level settings (feature flags, defaults) |
| `created_at` | `timestamptz` | NO | `now()` |  |
| `updated_at` | `timestamptz` | NO | `now()` |  |
| `deleted_at` | `timestamptz` | YES |  | Soft delete |

**Constraints**

- PK: (`id`)
- FK: (`created_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- If `slug` is used: **unique** on `slug` (prefer partial unique where `deleted_at IS NULL`)

**Suggested/optional indexes**

- `btree(updated_at DESC)` — list workspaces by most recently updated (recent projects at hand).

#### `workspace_members`

**Purpose**: Membership + RBAC at workspace scope.

**Primary key**: composite (`workspace_id`, `user_id`)

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `workspace_id` | `uuid` | NO |  | FK → `workspaces(id)` |
| `user_id` | `uuid` | NO |  | FK → `auth.users(id)` |
| `role` | `workspace_member_role` | NO |  | Workspace role |
| `invited_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `joined_at` | `timestamptz` | NO | `now()` |  |
| `revoked_at` | `timestamptz` | YES |  | Soft “remove member” without deleting the row |
| `revoked_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `last_active_at` | `timestamptz` | YES |  | For presence/analytics |

**Constraints**

- PK: (`workspace_id`, `user_id`)
- FK: (`workspace_id`) → `workspaces(id)` **ON DELETE CASCADE**
- FK: (`user_id`) → `auth.users(id)` **ON DELETE CASCADE**
- FK: (`invited_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- FK: (`revoked_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- CHECK: `revoked_at IS NULL OR revoked_at >= joined_at`

**Indexes**

- `btree(user_id, workspace_id)` — lookup by user: "list all workspaces I belong to" (e.g. sidebar / workspace switcher). Without it, the DB may scan by workspace first and filter by user.
- `btree(workspace_id) WHERE revoked_at IS NULL` — lookup active members of a workspace: "list current members" (excludes revoked). Partial index keeps only non-revoked rows, so it stays smaller and faster for this common query.

---

### 3) Information Architecture (Folders & Documents)

#### `folders`

**Purpose**: Organize documents into a hierarchical tree (adjacency list).

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `id` | `uuid` | NO |  | PK |
| `workspace_id` | `uuid` | NO |  | FK → `workspaces(id)` |
| `parent_folder_id` | `uuid` | YES |  | Self-FK → `folders(id)` |
| `name` | `text` | NO |  | Folder name (not necessarily unique globally) |
| `sort_order` | `integer` | YES |  | Optional manual ordering |
| `created_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `created_at` | `timestamptz` | NO | `now()` |  |
| `updated_at` | `timestamptz` | NO | `now()` |  |
| `deleted_at` | `timestamptz` | YES |  | Soft delete |

**Constraints**

- PK: (`id`)
- FK: (`workspace_id`) → `workspaces(id)` **ON DELETE CASCADE**
- FK: (`parent_folder_id`) → `folders(id)` **ON DELETE SET NULL**
- FK: (`created_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- Partial unique to prevent duplicate folder names within the same parent: `UNIQUE (workspace_id, parent_folder_id, name) WHERE deleted_at IS NULL`

**Indexes**

- `btree(workspace_id, parent_folder_id)` — list children of a folder (or root).
- `btree(workspace_id, updated_at DESC) WHERE deleted_at IS NULL` — list folders by most recently updated (active only).

#### `documents`

**Purpose**: Document metadata and access configuration. (CRDT content is stored separately.)

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `id` | `uuid` | NO |  | PK |
| `workspace_id` | `uuid` | NO |  | FK → `workspaces(id)` |
| `folder_id` | `uuid` | YES |  | FK → `folders(id)` |
| `title` | `text` | NO |  | Document title |
| `status` | `document_status` | NO | `active` | Active/archived |
| `visibility` | `document_visibility` | NO | `private` | Private/workspace/link/public |
| `workspace_default_role` | `document_member_role` | YES |  | Effective when `visibility = workspace` |
| `owner_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `created_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `updated_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `deleted_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `created_at` | `timestamptz` | NO | `now()` |  |
| `updated_at` | `timestamptz` | NO | `now()` |  |
| `archived_at` | `timestamptz` | YES |  |  |
| `deleted_at` | `timestamptz` | YES |  | Soft delete |
| `latest_version_id` | `uuid` | YES |  | FK → `document_versions(id)` (denormalized pointer) |

**Constraints**

- PK: (`id`)
- FK: (`workspace_id`) → `workspaces(id)` **ON DELETE CASCADE**
- FK: (`folder_id`) → `folders(id)` **ON DELETE SET NULL**
- FK: (`owner_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- FK: (`created_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- FK: (`updated_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- FK: (`deleted_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- FK: (`latest_version_id`) → `document_versions(id)` **ON DELETE SET NULL**
- CHECK: `deleted_at IS NULL OR deleted_at >= created_at`
- CHECK: `archived_at IS NULL OR archived_at >= created_at`

**Indexes**

- `btree(workspace_id, folder_id, updated_at DESC) WHERE deleted_at IS NULL` — list documents in a folder (or root) by most recently updated.
- `btree(workspace_id, status, updated_at DESC) WHERE deleted_at IS NULL` — list documents by status (active/archived) and recency.
- `btree(workspace_id, lower(title)) WHERE deleted_at IS NULL` — exact title lookup / sort by title (case-insensitive).
- Trigram index on `title` (requires `pg_trgm`) — partial/fuzzy title search.

#### `document_members`

**Purpose**: Per-document membership and role overrides (document-level RBAC).

**Primary key**: composite (`document_id`, `user_id`)

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `document_id` | `uuid` | NO |  | FK → `documents(id)` |
| `user_id` | `uuid` | NO |  | FK → `auth.users(id)` |
| `role` | `document_member_role` | NO |  | Viewer/commenter/editor/owner |
| `added_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `created_at` | `timestamptz` | NO | `now()` |  |
| `last_viewed_at` | `timestamptz` | YES |  | Optional UX/recents |

**Constraints**

- PK: (`document_id`, `user_id`)
- FK: (`document_id`) → `documents(id)` **ON DELETE CASCADE**
- FK: (`user_id`) → `auth.users(id)` **ON DELETE CASCADE**
- FK: (`added_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**

**Indexes**

- `btree(user_id, document_id)` — list documents shared with the current user.
- `btree(document_id) INCLUDE (role)` — permission checks: resolve document + role from index without table lookup.

#### `document_share_links`

**Purpose**: Link-based sharing without requiring a user account.

**Security note**: Store **only a hash** of the secret token (e.g., SHA-256). Never store raw tokens.

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `id` | `uuid` | NO |  | PK |
| `document_id` | `uuid` | NO |  | FK → `documents(id)` |
| `role` | `document_member_role` | NO |  | Maximum permission granted by link |
| `token_hash` | `bytea` | NO |  | Unique; hash of the secret |
| `created_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `created_at` | `timestamptz` | NO | `now()` |  |
| `expires_at` | `timestamptz` | YES |  | Optional |
| `revoked_at` | `timestamptz` | YES |  | Optional |
| `last_used_at` | `timestamptz` | YES |  | Optional |
| `max_uses` | `integer` | YES |  | Optional abuse protection |
| `use_count` | `integer` | NO | `0` | Incremented on use |

**Constraints**

- PK: (`id`)
- FK: (`document_id`) → `documents(id)` **ON DELETE CASCADE**
- FK: (`created_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- UNIQUE: (`token_hash`)
- CHECK: `expires_at IS NULL OR expires_at > created_at`
- CHECK: `revoked_at IS NULL OR revoked_at >= created_at`

**Indexes**

- `btree(document_id) WHERE revoked_at IS NULL` — list active share links for a document.

---

### 4) Document Versioning

#### `document_versions`

**Purpose**: Immutable document snapshots for versioning, export, and RAG pipelines.

**Note**: The canonical live state is Y.js. A version is typically created by snapshotting the current CRDT state and converting it to ProseMirror JSON + extracted plain text.

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `id` | `uuid` | NO |  | PK |
| `document_id` | `uuid` | NO |  | FK → `documents(id)` |
| `version_number` | `bigint` | NO |  | Monotonic per document |
| `source` | `text` | NO |  | e.g. `manual`, `autosnapshot`, `import` |
| `content_json` | `jsonb` | NO |  | ProseMirror/Tiptap document JSON |
| `content_text` | `text` | NO | `''` | Plain text extraction |
| `content_hash` | `bytea` | YES |  | Optional dedup/ETag |
| `yjs_snapshot_id` | `uuid` | YES |  | FK → `document_collab_snapshots(id)` |
| `created_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `created_at` | `timestamptz` | NO | `now()` |  |

**Constraints**

- PK: (`id`)
- FK: (`document_id`) → `documents(id)` **ON DELETE CASCADE**
- FK: (`yjs_snapshot_id`) → `document_collab_snapshots(id)` **ON DELETE SET NULL**
- FK: (`created_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- UNIQUE: (`document_id`, `version_number`)
- CHECK: `version_number > 0`

**Indexes**

- `btree(document_id, version_number DESC)` — list versions of a document (e.g. history UI, latest version).
- `GIN(to_tsvector('english', content_text))` (or a stored `tsvector` column) — full-text search over version content. Required when that feature is implemented; can be deferred at launch.

---

### 5) Collaboration Storage (Y.js CRDT)

#### `document_collab_updates`

**Purpose**: Append-only log of Y.js updates for each document.

**Note**: Updates do not need to be persisted on every change. Real-time sync is handled by the collaboration server (in-memory or ephemeral store). Persist to this table in batches (e.g. every N seconds or N updates) or when creating snapshots; avoid one insert per keystroke to reduce write load and stay within tier limits.

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `document_id` | `uuid` | NO |  | FK → `documents(id)` |
| `seq` | `bigint` | NO |  | Monotonic per document |
| `update` | `bytea` | NO |  | Y.js update (binary) |
| `client_id` | `bigint` | YES |  | Optional Y.js client ID |
| `user_id` | `uuid` | YES |  | FK → `auth.users(id)`; may be null for system writes |
| `created_at` | `timestamptz` | NO | `now()` |  |

**Constraints**

- PK: (`document_id`, `seq`)
- FK: (`document_id`) → `documents(id)` **ON DELETE CASCADE**
- FK: (`user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- CHECK: `seq > 0`

**Partitioning (future)**

- When this table becomes large, consider partitioning by **time** (monthly) or by **hash(document_id)** to improve maintenance and prune old data.

**Indexes**

- `btree(document_id, created_at DESC)` — list updates by document and recency (debugging, ops).

#### `document_collab_snapshots`

**Purpose**: Periodic full-state checkpoints used to speed up document load and to compact the update log.

| Column | Type | Null | Default | Notes |
|---|---:|:---:|:---:|---|
| `id` | `uuid` | NO |  | PK |
| `document_id` | `uuid` | NO |  | FK → `documents(id)` |
| `snapshot_seq` | `bigint` | NO |  | Highest `seq` included |
| `ydoc` | `bytea` | NO |  | Full Y.js document state |
| `state_vector` | `bytea` | NO |  | Y.js state vector |
| `created_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `created_at` | `timestamptz` | NO | `now()` |  |

**Constraints**

- PK: (`id`)
- FK: (`document_id`) → `documents(id)` **ON DELETE CASCADE**
- FK: (`created_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- UNIQUE: (`document_id`, `snapshot_seq`)
- CHECK: `snapshot_seq > 0`

**Indexes**

- `btree(document_id, snapshot_seq DESC)` — load latest snapshot for a document (required for fast doc load).

#### (Suggested/Optional) `document_collab_state`

**Purpose**: Fast pointer to the latest CRDT sequence and snapshot without scanning.

**Note**: Not required at launch. You can obtain the latest snapshot via the index on `document_collab_snapshots` and latest seq via `MAX(seq)` on `document_collab_updates`. Consider adding this table later if those queries become a bottleneck (e.g. high concurrency or very large update logs).

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `document_id` | `uuid` | NO |  | PK/FK → `documents(id)` |
| `latest_seq` | `bigint` | NO |  | Latest update seq observed |
| `latest_snapshot_id` | `uuid` | YES |  | FK → `document_collab_snapshots(id)` |
| `updated_at` | `timestamptz` | NO | `now()` |  |

**Constraints**

- PK: (`document_id`)
- FK: (`document_id`) → `documents(id)` **ON DELETE CASCADE**
- FK: (`latest_snapshot_id`) → `document_collab_snapshots(id)` **ON DELETE SET NULL**

---

### 6) AI: Conversations, Suggestions, and RAG (pgvector)

#### `ai_conversations`

**Purpose**: Persisted AI chat sessions (for “Recent Conversations” and history).

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `id` | `uuid` | NO |  | PK |
| `workspace_id` | `uuid` | NO |  | FK → `workspaces(id)` |
| `document_id` | `uuid` | YES |  | FK → `documents(id)` (conversation may be document-scoped) |
| `title` | `text` | YES |  | Optional UI title |
| `status` | `ai_conversation_status` | NO | `active` | Active/archived |
| `created_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `created_at` | `timestamptz` | NO | `now()` |  |
| `updated_at` | `timestamptz` | NO | `now()` |  |
| `archived_at` | `timestamptz` | YES |  |  |
| `deleted_at` | `timestamptz` | YES |  | Soft delete |

**Constraints**

- PK: (`id`)
- FK: (`workspace_id`) → `workspaces(id)` **ON DELETE CASCADE**
- FK: (`document_id`) → `documents(id)` **ON DELETE SET NULL**
- FK: (`created_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**

**Indexes**

- `btree(workspace_id, updated_at DESC) WHERE deleted_at IS NULL` — list conversations in a workspace by most recently updated (recent conversations UI).
- `btree(document_id, updated_at DESC) WHERE deleted_at IS NULL AND document_id IS NOT NULL` — list conversations for a specific document (document-scoped chat sidebar).

#### `ai_messages`

**Purpose**: Ordered message log for each conversation.

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `id` | `uuid` | NO |  | PK |
| `conversation_id` | `uuid` | NO |  | FK → `ai_conversations(id)` |
| `message_index` | `bigint` | NO |  | Monotonic per conversation |
| `role` | `ai_message_role` | NO |  | system/user/assistant/tool |
| `user_id` | `uuid` | YES |  | FK → `auth.users(id)` (for user messages) |
| `content_text` | `text` | NO |  | Message text |
| `content_json` | `jsonb` | YES |  | Optional structured payload (tool calls, rich content) |
| `provider` | `text` | YES |  | e.g., `openai`, `anthropic` |
| `model` | `text` | YES |  | e.g., `gpt-4.1`, etc. |
| `prompt_tokens` | `integer` | YES |  | Optional metrics |
| `completion_tokens` | `integer` | YES |  | Optional metrics |
| `total_tokens` | `integer` | YES |  | Optional metrics |
| `latency_ms` | `integer` | YES |  | Optional metrics |
| `finish_reason` | `text` | YES |  | Optional |
| `metadata` | `jsonb` | NO | `'{}'` | Trace IDs, tool metadata, etc. |
| `created_at` | `timestamptz` | NO | `now()` |  |

**Constraints**

- PK: (`id`)
- FK: (`conversation_id`) → `ai_conversations(id)` **ON DELETE CASCADE**
- FK: (`user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- UNIQUE: (`conversation_id`, `message_index`)
- CHECK: `message_index > 0`

**Indexes**

- `btree(conversation_id, message_index)` — load messages for a conversation in order (conversation history).
- `btree(created_at DESC)` — list messages across all conversations by recency (analytics, global activity view).

#### `ai_message_context_items`

**Purpose**: Structured references to document context used to answer a message (selections, chunks, headings).

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `id` | `uuid` | NO |  | PK |
| `message_id` | `uuid` | NO |  | FK → `ai_messages(id)` |
| `document_id` | `uuid` | YES |  | FK → `documents(id)` |
| `document_version_id` | `uuid` | YES |  | FK → `document_versions(id)` |
| `context_type` | `text` | NO |  | e.g., `selection`, `chunk`, `heading` |
| `start_offset` | `integer` | YES |  | Optional (plain-text offsets) |
| `end_offset` | `integer` | YES |  | Optional |
| `selected_text` | `text` | YES |  | Optional |
| `metadata` | `jsonb` | NO | `'{}'` | Node IDs, etc. |
| `created_at` | `timestamptz` | NO | `now()` |  |

**Constraints**

- PK: (`id`)
- FK: (`message_id`) → `ai_messages(id)` **ON DELETE CASCADE**
- FK: (`document_id`) → `documents(id)` **ON DELETE SET NULL**
- FK: (`document_version_id`) → `document_versions(id)` **ON DELETE SET NULL**
- CHECK: `end_offset IS NULL OR start_offset IS NULL OR end_offset >= start_offset`

**Indexes**

- `btree(message_id)` — list context items used for a specific message (show citations/references in UI).
- `btree(document_id) WHERE document_id IS NOT NULL` — list context items referencing a document (analytics, debugging, "this part was cited" in editor).

#### `ai_suggestions`

**Purpose**: Persist AI-proposed document edits (diffs) that a user can apply/regenerate/audit.

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `id` | `uuid` | NO |  | PK |
| `workspace_id` | `uuid` | NO |  | FK → `workspaces(id)` |
| `document_id` | `uuid` | NO |  | FK → `documents(id)` |
| `conversation_id` | `uuid` | YES |  | FK → `ai_conversations(id)` |
| `message_id` | `uuid` | YES |  | FK → `ai_messages(id)` (assistant message source) |
| `status` | `ai_suggestion_status` | NO | `proposed` | Lifecycle |
| `title` | `text` | YES |  | Optional |
| `diff_json` | `jsonb` | NO |  | ProseMirror steps/patch format |
| `created_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `created_at` | `timestamptz` | NO | `now()` |  |
| `updated_at` | `timestamptz` | NO | `now()` |  |
| `applied_at` | `timestamptz` | YES |  |  |
| `applied_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `dismissed_at` | `timestamptz` | YES |  |  |
| `dismissed_by_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `deleted_at` | `timestamptz` | YES |  | Soft delete |

**Constraints**

- PK: (`id`)
- FK: (`workspace_id`) → `workspaces(id)` **ON DELETE CASCADE**
- FK: (`document_id`) → `documents(id)` **ON DELETE CASCADE**
- FK: (`conversation_id`) → `ai_conversations(id)` **ON DELETE SET NULL**
- FK: (`message_id`) → `ai_messages(id)` **ON DELETE SET NULL**
- FK: (`created_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- FK: (`applied_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**
- FK: (`dismissed_by_user_id`) → `auth.users(id)` **ON DELETE SET NULL**

**Indexes**

- `btree(document_id, created_at DESC) WHERE deleted_at IS NULL` — list suggestions for a document by recency (suggestions panel in editor).
- `btree(workspace_id, status, updated_at DESC) WHERE deleted_at IS NULL` — list suggestions by status (proposed/applied/dismissed) and recency (suggestions inbox/review panel).

#### `document_embeddings`

**Purpose**: Chunk-level embeddings for RAG over documents.

**Embedding dimension**: Choose a single system-wide dimension and enforce it at the type level for indexability.

- Recommended baseline: `vector(1536)` (common embedding dimensionality)
- If you need multiple dimensions/models, use separate tables per dimension (e.g., `document_embeddings_3072`).

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `id` | `uuid` | NO |  | PK |
| `workspace_id` | `uuid` | NO |  | FK → `workspaces(id)` |
| `document_id` | `uuid` | NO |  | FK → `documents(id)` |
| `document_version_id` | `uuid` | NO |  | FK → `document_versions(id)` |
| `chunk_index` | `integer` | NO |  | Chunk ordering within a version |
| `chunk_text` | `text` | NO |  | Text used to embed |
| `chunk_hash` | `bytea` | YES |  | Optional hash for dedup |
| `token_count` | `integer` | YES |  | Optional |
| `metadata` | `jsonb` | NO | `'{}'` | Headings, offsets, etc. |
| `embedding_model` | `text` | NO |  | e.g., `text-embedding-3-small` |
| `embedding` | `vector(1536)` | NO |  | pgvector embedding |
| `created_at` | `timestamptz` | NO | `now()` |  |
| `updated_at` | `timestamptz` | NO | `now()` |  |
| `deleted_at` | `timestamptz` | YES |  | Soft delete (e.g., when superseded) |

**Constraints**

- PK: (`id`)
- FK: (`workspace_id`) → `workspaces(id)` **ON DELETE CASCADE**
- FK: (`document_id`) → `documents(id)` **ON DELETE CASCADE**
- FK: (`document_version_id`) → `document_versions(id)` **ON DELETE CASCADE**
- UNIQUE: (`document_version_id`, `chunk_index`, `embedding_model`)
- CHECK: `chunk_index >= 0`

**Indexes**

- `btree(workspace_id, document_id, document_version_id)` — maintenance and lookups by workspace → document → version.
- `btree(document_id, document_version_id, chunk_index)` — inspect all chunks for a given document version in order.
- **HNSW** ANN index on `embedding` — primary vector index for RAG (fast, good recall; requires newer pgvector).

**Partitioning**

- Partition by `workspace_id` (hash) for strong tenant isolation and to keep ANN indexes smaller and faster per partition.

---

### 7) Audit & Operational Tables (Recommended)

#### `audit_events`

**Purpose**: Append-only audit/event log for security and debugging.

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `id` | `uuid` | NO |  | PK |
| `workspace_id` | `uuid` | YES |  | FK → `workspaces(id)`; nullable for global events |
| `actor_user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `severity` | `audit_event_severity` | NO | `info` |  |
| `event_type` | `text` | NO |  | e.g., `document.created` |
| `entity_type` | `text` | YES |  | e.g., `document` |
| `entity_id` | `uuid` | YES |  |  |
| `request_id` | `uuid` | YES |  | Correlate across services |
| `ip` | `inet` | YES |  | Optional |
| `user_agent` | `text` | YES |  | Optional |
| `metadata` | `jsonb` | NO | `'{}'` | Arbitrary structured details |
| `created_at` | `timestamptz` | NO | `now()` |  |

**Constraints**

- PK: (`id`)
- FK: (`workspace_id`) → `workspaces(id)` **ON DELETE SET NULL**
- FK: (`actor_user_id`) → `auth.users(id)` **ON DELETE SET NULL**

**Indexes**

- `btree(workspace_id, created_at DESC)` — list recent events for a workspace.
- `btree(actor_user_id, created_at DESC)` — list recent events performed by a user.
- `btree(event_type, created_at DESC)` — list recent events of a given type.

**Partitioning**

- Partition by `created_at` (monthly) once volume grows, to support efficient retention and faster time-range queries.

#### (Optional) `idempotency_keys`

**Purpose**: Support `Idempotency-Key` for retry-safe POST operations at the API Gateway.

**Note**: Not required for v1. Introduce this table and idempotency handling when you add billing or other non-idempotent, side-effectful operations that may be retried.

| Column | Type | Null | Default | Notes |
|---|---:|:---:|---:|---|
| `id` | `uuid` | NO |  | PK |
| `workspace_id` | `uuid` | YES |  | FK → `workspaces(id)` |
| `user_id` | `uuid` | YES |  | FK → `auth.users(id)` |
| `idempotency_key` | `text` | NO |  | The incoming header value |
| `request_fingerprint` | `bytea` | NO |  | Hash of method+path+body |
| `response_json` | `jsonb` | YES |  | Stored response (optional) |
| `status_code` | `integer` | YES |  |  |
| `created_at` | `timestamptz` | NO | `now()` |  |
| `expires_at` | `timestamptz` | NO |  | TTL cleanup |

**Constraints**

- PK: (`id`)
- UNIQUE: (`idempotency_key`, `user_id`) (or include `workspace_id` depending on scope)
- FK: (`workspace_id`) → `workspaces(id)` **ON DELETE SET NULL**
- FK: (`user_id`) → `auth.users(id)` **ON DELETE SET NULL**

## Operational Notes (Recommended)

- **CRDT updates**: periodic snapshots + compaction to prevent unbounded growth.
  - After creating a snapshot at `snapshot_seq`, older updates can be pruned up to that seq (if snapshots are trusted).
- **Embeddings**: keep embeddings tied to immutable `document_versions`. When a version is superseded, mark old embeddings as `deleted_at` for cleanup.
- **Audit events**: add partitioning + a retention window if required (e.g., keep 90 days hot, archive older data).
