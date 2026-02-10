# Caret - Database Schema & Vector Storage

## Overview
Caret uses **PostgreSQL** (via Supabase) as its primary database, with **pgvector** for semantic search and AI context retrieval.

## Database Schema

### 1. `profiles`
- `id`: uuid (references auth.users)
- `email`: text
- `full_name`: text
- `avatar_url`: text
- `updated_at`: timestamp

### 2. `documents`
- `id`: uuid (primary key)
- `owner_id`: uuid (references profiles.id)
- `title`: text (default: 'Untitled')
- `content`: jsonb (Tiptap/Prosemirror JSON structure - used for fallback and search)
- `yjs_snapshot`: bytea (full Y.js document snapshot - updated periodically)
- `created_at`: timestamp
- `updated_at`: timestamp

### 3. `yjs_updates` (Update Log Strategy)
- `id`: bigserial (primary key)
- `document_id`: uuid (references documents.id)
- `update`: bytea (Y.js binary update)
- `created_at`: timestamp

**Persistence Strategy**: We use a "Snapshot + Update Log" approach:
- `yjs_snapshot` stores the full document state (updated every 100 updates or 5 minutes).
- `yjs_updates` stores incremental binary updates since the last snapshot.
- On document load: Merge snapshot + all subsequent updates.
- Periodically compact: Apply updates to snapshot and delete old update records.

### 4. `document_sections` (Vector Storage)
- `id`: uuid
- `document_id`: uuid (references documents.id)
- `content`: text (chunked document text)
- `embedding`: vector(1536) (OpenAI or similar embeddings)
- `metadata`: jsonb (page number, section heading, etc.)

### 5. `collaborators`
- `document_id`: uuid (references documents.id)
- `user_id`: uuid (references profiles.id)
- `role`: text (owner, editor, viewer)

## Performance Indexes

```sql
-- HNSW Index for fast vector similarity search
CREATE INDEX ON document_sections 
USING hnsw (embedding vector_cosine_ops);

-- B-tree indexes for frequent queries
CREATE INDEX idx_documents_owner ON documents(owner_id);
CREATE INDEX idx_yjs_updates_document ON yjs_updates(document_id, created_at DESC);
CREATE INDEX idx_document_sections_document ON document_sections(document_id);
```

## Vector Search & RAG
- **Extension**: `pgvector` enabled in Supabase.
- **Embedding Model**: `text-embedding-3-small` (or similar).
- **Chunking Strategy**: Recursive character splitting with overlap.
- **Search**: Cosine similarity for semantic retrieval.

## Security & Performance
- **Row Level Security (RLS)**: Strict policies to ensure users only access their own documents or those shared with them.
- **Connection Pooling**: Use Supabase's built-in connection pooling for Lambda functions.
- **Indexes**: GIST or HNSW indexes on embedding columns for fast vector search.
