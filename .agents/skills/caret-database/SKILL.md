---
name: caret-database
description: Caret database - Supabase Cloud PostgreSQL, pgvector, RLS policies, Drizzle and Alembic migrations, core document tables, AI/RAG tables, and Y.js collaboration persistence. Use when creating or modifying database tables, migrations, RLS policies, indexes, Supabase access, pgvector search, or any data model in the Caret project.
---

# Caret Database

## Stack

- **Supabase Cloud PostgreSQL** is the only production database. It is not hosted on the Hetzner VPS.
- **Supabase Auth** (`auth.users`) is the identity source of truth.
- **pgvector** stores document embeddings for RAG and semantic search.
- **Drizzle ORM** is used by Node.js services: `document-service`, `auth-service`, and `collab-service`.
- **SQLAlchemy async + Alembic** is used by the Python `ai-service`.
- **Supabase JS** is used directly by the frontend for auth and `user_profiles`.
- Application tables live in the `public` schema.

## Migration Sources

| Area | Source Of Truth |
|---|---|
| Core documents/workspaces/folders/profiles | `app/backend/document-service/src/db/schema.ts` and `src/db/migrations/` |
| Collaboration persistence | `app/backend/collab-service/src/db/schema.ts` and `src/db/migrations/` |
| AI conversations/messages/suggestions/embeddings | `app/backend/ai-service/src/models/ai.py` and Alembic versions |
| Live Supabase migration history | `alembic_version` for AI-service Alembic migrations |

Drizzle-generated `drizzle/` snapshots may exist, but prefer the service `src/db/schema.ts` and explicit migration files when reasoning about current intent.

## Required PostgreSQL Extensions

```sql
pgcrypto            -- gen_random_uuid(); relied on by schemas/migrations
vector              -- pgvector; enabled by AI migration 0002_document_embeddings.py
citext              -- case-insensitive slugs; enabled by document-service migration 002_slug_citext.sql
pg_trgm             -- planned/allowed for text search
pg_stat_statements  -- planned/allowed for query observability
```

## Current Tables And Usage

Do not delete tables from the live Supabase project just because they are not visible in a specific UI flow. The current code uses the full schema below, except `alembic_version`, which is Alembic infrastructure and must still be kept.

| Table | Status | Runtime Owner |
|---|---|---|
| `user_profiles` | Keep | Frontend reads/upserts it through Supabase JS in `authStore.ts` |
| `workspaces` | Keep | Document service workspace repository |
| `workspace_members` | Keep | Document service membership and access checks |
| `folders` | Keep | Document service folder tree |
| `documents` | Keep | Document service document metadata |
| `document_members` | Keep | Document sharing and permission checks |
| `document_versions` | Keep | Document content/version history |
| `document_embeddings` | Keep | AI service RAG indexing and semantic search |
| `ai_conversations` | Keep | AI service chat session persistence |
| `ai_messages` | Keep | AI service chat turns and tool traces |
| `ai_suggestions` | Keep | AI service suggestion lifecycle |
| `document_collab_updates` | Keep, partially wired | Collab service Y.js incremental update log |
| `document_collab_snapshots` | Keep, partially wired | Collab service Y.js periodic snapshots |
| `alembic_version` | Keep | Alembic migration bookkeeping, not an app domain table |

`document_collab_updates` and `document_collab_snapshots` are partially wired into runtime code. When `collab-service` has `DATABASE_URL`, it creates `CollabRepository`, wraps it in `CollabPersistenceService`, persists Y.js updates from `ConnectionHandler`, and starts `SnapshotScheduler` to save periodic snapshots. However, room initialization currently creates a fresh `Y.Doc` in `RoomManager` and does not call `CollabPersistenceService.loadDocument`, so persisted state is not yet restored when a room starts.

## Conventions

### Naming

- Tables and columns: `snake_case`, plural table names.
- Foreign keys: `<singular>_id`, for example `workspace_id` and `document_id`.
- TypeScript schema exports use the table name, for example `document_versions`.
- Python SQLAlchemy models use `PascalCase`, for example `DocumentEmbedding`.

### Keys And Timestamps

- Prefer `uuid` primary keys with `gen_random_uuid()`.
- Use composite primary keys only for pure join/log tables such as `document_collab_updates`.
- Use `timestamptz` for persisted timestamps.
- Use `created_at` and `updated_at` where the entity is mutable.
- Use `deleted_at` for soft-deletable domain entities.

### Soft Deletes

- Treat `deleted_at IS NULL` as active.
- Use partial unique indexes when uniqueness should ignore soft-deleted records.
- Do not hard-delete user content unless the feature explicitly requires permanent deletion.

## RLS Rules

- Core document tables have RLS policies in `document-service/src/db/migrations/001_rls_core_tables.sql`.
- `user_profiles` has self-access policies and is used directly by the frontend with the Supabase anon client.
- Collaboration tables have RLS in `collab-service/src/db/migrations/001_rls_collab_tables.sql`.
- AI tables have RLS in `ai-service/src/db/migrations/versions/0003_enable_rls_on_public_tables.py`.
- Backend services commonly use service credentials or server-side JWT validation; frontend direct DB access should stay limited to explicitly permitted Supabase tables such as `user_profiles`.
- Test destructive RLS changes against a dedicated Supabase test project, never production.

## pgvector And RAG

- `document_embeddings` stores chunk-level embeddings with `vector(1536)`.
- `EmbeddingService` indexes document text, replaces old chunks for a document, and searches similar chunks.
- `ai-service` injects retrieved context into agent flows through `search_workspace_context`.
- Keep `workspace_id` on embeddings for workspace-scoped retrieval.
- Keep HNSW cosine indexes for fast approximate nearest-neighbor search.

## CRDT Persistence

- `document_collab_updates` is the append-only Y.js update log with composite key `(document_id, seq)`.
- `document_collab_snapshots` stores periodic full-state Y.js snapshots and state vectors.
- `CollabPersistenceService.loadDocument` can reconstruct a document by applying the latest snapshot and then incremental updates, but this method is not currently called by the WebSocket room creation path.
- On sync updates, `ConnectionHandler` persists encoded Y.js updates when persistence is configured.
- `SnapshotScheduler` periodically snapshots active in-memory rooms.
- These tables may appear disconnected in Supabase's schema visualizer because the current Drizzle schema does not declare SQL foreign key constraints to `documents`; the relationship exists by `document_id` convention, RLS helper functions, and service code.
- Do not drop either collaboration table unless collaboration persistence is intentionally removed from the product and the service code is changed first.
- If fixing collaboration persistence, wire room creation to load from `CollabPersistenceService.loadDocument` before the initial sync step.

## AI Tables

- `ai_conversations`: conversation metadata scoped to user/document.
- `ai_messages`: chat turns; includes `tool_calls` JSONB after migration `0004_ai_messages_tool_calls.py`.
- `ai_suggestions`: proposed/applied/dismissed/superseded text suggestions.
- `document_embeddings`: RAG storage, maintained separately from chat messages.
