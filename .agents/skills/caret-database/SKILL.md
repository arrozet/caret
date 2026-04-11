---
name: caret-database
description: Caret database — PostgreSQL/Supabase schema conventions, core tables, RLS policies, pgvector setup, Y.js CRDT tables, and AI tables. Use when creating or modifying database tables, migrations, RLS policies, indexes, or when working with Supabase, pgvector, or any data model in the Caret project.
---

# Caret Database

## Stack

- **PostgreSQL** via Supabase (no self-hosted DB)
- **pgvector** for RAG/semantic search
- **Supabase Auth** (`auth.users`) as identity source of truth
- All application tables in `public` schema

## Required PostgreSQL Extensions

```sql
pgcrypto      -- gen_random_uuid()
vector        -- pgvector: HNSW/IVFFLAT indexes
citext        -- case-insensitive text (emails, slugs)
pg_trgm       -- trigram search (titles, names)
pg_stat_statements -- query observability
```

## Conventions (Required)

### Naming
- Tables/columns: `snake_case`, plural nouns (`documents`, `workspaces`)
- Foreign keys: `<singular>_id` (e.g. `workspace_id`, `document_id`)

### Primary Keys
- `uuid` with `gen_random_uuid()` (from pgcrypto)
- Composite PKs only for pure join tables

### Timestamps
- Always `timestamptz` (never `timestamp`)
- Every table: `created_at` (required), `updated_at` (required), `deleted_at` (optional = soft delete)

### Soft Deletes
- `deleted_at IS NULL` = active record
- Partial unique indexes: `UNIQUE (...) WHERE deleted_at IS NULL`

## Core Tables

| Table | Purpose |
|---|---|
| `user_profiles` | App-level profile (extends `auth.users`) |
| `workspaces` | Primary tenant unit |
| `workspace_members` | User↔Workspace with role |
| `folders` | Document organization (tree, self-referencing) |
| `documents` | Core documents with CRDT content |
| `document_members` | Per-document fine-grained permissions |
| `document_collab_updates` | Y.js incremental CRDT updates log |
| `document_collab_snapshots` | Periodic Y.js state snapshots (compaction) |
| `ai_conversations` | AI chat sessions per document |
| `ai_messages` | Individual chat messages (system/user/assistant/tool) |
| `ai_suggestions` | AI text suggestions with apply/dismiss lifecycle |
| `document_embeddings` | pgvector chunk embeddings for RAG |

## Key Enum Types

```sql
workspace_member_role: owner | admin | member | guest
document_visibility:   private | workspace | link | public
document_member_role:  owner | editor | commenter | viewer
document_status:       active | archived
ai_message_role:       system | user | assistant | tool
ai_suggestion_status:  proposed | applied | dismissed | superseded
```

## Index Strategy

- **B-tree**: standard lookup (FK columns, `workspace_id`, `user_id`, `created_at`)
- **HNSW** (pgvector): `document_embeddings.embedding` for ANN semantic search
- **GIN**: full-text search on document titles/content if needed
- **Partial unique**: uniqueness ignoring soft-deleted rows

## RLS Design

- All domain tables have RLS enabled
- Users access only records in their workspaces
- Document-level permissions checked against `document_members`
- `workspace_member_role` and `document_member_role` drive policy conditions
- Test RLS on a **dedicated test Supabase project**, never production

## CRDT Consistency Rule

The AI Service **never** writes document state to the DB directly.
- AI streams via SSE → Frontend applies as Tiptap Transaction → Y.js update → sync to all collaborators
- `document_collab_updates`: append-only log of Y.js binary updates per document
- `document_collab_snapshots`: periodic compaction snapshots to keep the updates log bounded

## pgvector (RAG)

```sql
-- document_embeddings
embedding  vector(1536)  -- OpenAI ada-002 dimensions (adjust per model)

-- HNSW index for fast ANN search
CREATE INDEX ON document_embeddings USING hnsw (embedding vector_cosine_ops);
```

Chunk documents before embedding. Store `chunk_index`, `chunk_text`, and source `document_id`.
