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
- `content`: jsonb (Tiptap/Prosemirror JSON structure)
- `yjs_state`: bytea (binary storage for Y.js document state)
- `created_at`: timestamp
- `updated_at`: timestamp

### 3. `document_sections` (Vector Storage)
- `id`: uuid
- `document_id`: uuid (references documents.id)
- `content`: text (chunked document text)
- `embedding`: vector(1536) (OpenAI or similar embeddings)
- `metadata`: jsonb (page number, section heading, etc.)

### 4. `collaborators`
- `document_id`: uuid (references documents.id)
- `user_id`: uuid (references profiles.id)
- `role`: text (owner, editor, viewer)

## Vector Search & RAG
- **Extension**: `pgvector` enabled in Supabase.
- **Embedding Model**: `text-embedding-3-small` (or similar).
- **Chunking Strategy**: Recursive character splitting with overlap.
- **Search**: Cosine similarity for semantic retrieval.

## Security & Performance
- **Row Level Security (RLS)**: Strict policies to ensure users only access their own documents or those shared with them.
- **Connection Pooling**: Use Supabase's built-in connection pooling for Lambda functions.
- **Indexes**: GIST or HNSW indexes on embedding columns for fast vector search.
