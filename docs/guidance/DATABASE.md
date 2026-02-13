# Caret - Database Schema & Architecture

## Overview

Caret uses **PostgreSQL** (via Supabase) as its primary database with **pgvector** extension for semantic search and AI context retrieval. This document specifies the complete database schema designed to support authentication, document management, real-time collaboration (Y.js CRDT), AI-powered features (RAG), and multi-user permissions.

## Design Principles

- **Normalization**: Third Normal Form (3NF) to minimize redundancy
- **Scalability**: Partitioning strategies for high-volume tables
- **Performance**: Strategic indexing (B-tree, HNSW, GIN) for query optimization
- **Security**: Row Level Security (RLS) policies for tenant isolation
- **Audit Trail**: Timestamps and soft deletes for data recovery
- **Referential Integrity**: Foreign keys with appropriate cascade rules
- **Type Safety**: Use of ENUMs and CHECK constraints for data validation

---

## Core Tables

### 1. Authentication & User Management

#### `profiles`

User profile information extending Supabase Auth.

```sql
profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT NOT NULL UNIQUE,
  full_name         TEXT,
  avatar_url        TEXT,
  language_code     VARCHAR(10) DEFAULT 'en-US',
  theme_preference  VARCHAR(10) DEFAULT 'system' CHECK (theme_preference IN ('light', 'dark', 'system')),
  timezone          TEXT DEFAULT 'UTC',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  metadata          JSONB DEFAULT '{}'::jsonb
)
```

**Indexes:**
- `idx_profiles_email` on `email` (UNIQUE, B-tree)
- `idx_profiles_last_seen` on `last_seen_at` (B-tree, for activity tracking)

**Notes:**
- `language_code`: Stores user's preferred language (en-US, es, fr, de, pt)
- `theme_preference`: User's theme choice (light, dark, or system)
- `metadata`: Flexible JSONB for future extensions (onboarding state, feature flags, etc.)

---

### 2. Document Management

#### `documents`

Core document entity with metadata and versioning support.

```sql
documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title             TEXT NOT NULL DEFAULT 'Untitled Document',
  slug              TEXT,
  content           JSONB, -- Tiptap/Prosemirror JSON structure (fallback, search, preview)
  yjs_snapshot      BYTEA, -- Full Y.js document snapshot (periodically updated)
  snapshot_version  BIGINT NOT NULL DEFAULT 0,
  word_count        INTEGER DEFAULT 0,
  char_count        INTEGER DEFAULT 0,
  status            VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived', 'deleted')),
  is_template       BOOLEAN NOT NULL DEFAULT false,
  parent_id         UUID REFERENCES documents(id) ON DELETE SET NULL, -- For document hierarchy/templates
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at      TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ, -- Soft delete
  last_edited_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata          JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT valid_slug CHECK (slug IS NULL OR slug ~ '^[a-z0-9-]+$')
)
```

**Indexes:**
- `idx_documents_owner` on `owner_id` (B-tree)
- `idx_documents_status` on `status` WHERE `deleted_at IS NULL` (Partial index)
- `idx_documents_updated` on `updated_at DESC` (B-tree, for sorting)
- `idx_documents_slug` on `slug` WHERE `slug IS NOT NULL` (Unique partial index)
- `idx_documents_parent` on `parent_id` (B-tree, for hierarchies)
- `idx_documents_content_gin` on `content` (GIN, for JSONB queries)

**Notes:**
- `yjs_snapshot`: Stores the full Y.js binary state (updated every 100 edits or 5 minutes)
- `content`: Tiptap JSON format for search, export, and fallback rendering
- `slug`: Optional URL-friendly identifier for public/shared documents
- `status`: Document lifecycle state (draft → published → archived)
- `deleted_at`: Soft delete for recovery (actual deletion after 30 days via cron)

---

#### `yjs_updates`

Update log for Y.js CRDT incremental synchronization.

```sql
yjs_updates (
  id                BIGSERIAL PRIMARY KEY,
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  update_data       BYTEA NOT NULL, -- Y.js binary update
  user_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_to_snapshot BOOLEAN NOT NULL DEFAULT false
)
```

**Indexes:**
- `idx_yjs_updates_document_time` on `document_id, created_at DESC` (Composite B-tree)
- `idx_yjs_updates_pending` on `document_id` WHERE `applied_to_snapshot = false` (Partial index)

**Partitioning Strategy:**
- Partition by `created_at` (monthly) for scalability
- Old partitions can be archived/dropped after snapshot consolidation

**Notes:**
- Stores incremental Y.js updates since the last snapshot
- On document load: merge `yjs_snapshot` + all `yjs_updates` where `applied_to_snapshot = false`
- Background job consolidates updates into snapshot and marks `applied_to_snapshot = true`
- Cleanup: Delete updates older than 30 days that are already applied

---

#### `document_versions`

Historical snapshots for document versioning and rollback.

```sql
document_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number    INTEGER NOT NULL,
  content           JSONB NOT NULL, -- Tiptap JSON at this version
  yjs_snapshot      BYTEA, -- Optional Y.js snapshot
  created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comment           TEXT, -- Version note (e.g., "Final draft before review")
  metadata          JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT unique_document_version UNIQUE (document_id, version_number)
)
```

**Indexes:**
- `idx_document_versions_document` on `document_id, version_number DESC` (Composite B-tree)
- `idx_document_versions_created` on `created_at DESC` (B-tree)

**Notes:**
- Manual snapshots created by users or automatically on major milestones
- Enables "Restore to this version" functionality
- `version_number`: Auto-incremented per document (1, 2, 3, ...)

---

### 3. Real-Time Collaboration

#### `collaborators`

Document access control and user roles.

```sql
collaborators (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role              VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'editor', 'commenter', 'viewer')),
  invited_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  invited_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at       TIMESTAMPTZ,
  last_accessed_at  TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  
  CONSTRAINT unique_collaborator UNIQUE (document_id, user_id)
)
```

**Indexes:**
- `idx_collaborators_document` on `document_id` (B-tree)
- `idx_collaborators_user` on `user_id` (B-tree)
- `idx_collaborators_role` on `document_id, role` (Composite B-tree)

**Notes:**
- `owner`: Full control (share, delete, transfer ownership)
- `editor`: Edit content, invite commenters/viewers
- `commenter`: Add comments/suggestions, no edit
- `viewer`: Read-only access
- `is_active`: Allows revoking access without deletion (audit trail)

---

#### `collaboration_sessions`

Active WebSocket connections for presence tracking.

```sql
collaboration_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  connection_id     TEXT NOT NULL UNIQUE, -- WebSocket connection identifier
  cursor_position   JSONB, -- {from: 100, to: 100}
  selection_range   JSONB, -- {from: 50, to: 150}
  user_color        VARCHAR(7), -- #FF5733 (assigned color for live cursor)
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at   TIMESTAMPTZ
)
```

**Indexes:**
- `idx_collab_sessions_document_active` on `document_id` WHERE `disconnected_at IS NULL` (Partial index)
- `idx_collab_sessions_user` on `user_id` (B-tree)
- `idx_collab_sessions_heartbeat` on `last_heartbeat` (B-tree, for cleanup)

**Notes:**
- Tracks active users editing a document in real-time
- `last_heartbeat`: Updated every 30 seconds; stale sessions (>2 min) marked as disconnected
- `cursor_position` and `selection_range`: For live cursor UI (Y.js Awareness protocol)
- Background job cleans up disconnected sessions older than 1 hour

---

### 4. AI Features & Vector Storage

#### `document_sections`

Chunked document content with vector embeddings for RAG.

```sql
document_sections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content           TEXT NOT NULL, -- Plain text chunk
  embedding         VECTOR(1536), -- OpenAI text-embedding-3-small (1536 dimensions)
  token_count       INTEGER,
  chunk_index       INTEGER NOT NULL, -- Order within document (0, 1, 2, ...)
  metadata          JSONB DEFAULT '{}'::jsonb, -- {heading: "Introduction", page: 1}
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_document_chunk UNIQUE (document_id, chunk_index)
)
```

**Indexes:**
- `idx_document_sections_document` on `document_id, chunk_index` (Composite B-tree)
- `idx_document_sections_embedding_hnsw` on `embedding` USING hnsw (vector_cosine_ops) (HNSW for fast ANN search)

**Notes:**
- **Chunking Strategy**: Recursive character splitting with 500-token chunks, 100-token overlap
- **Embedding Model**: `text-embedding-3-small` (1536 dimensions, cost-effective)
- **HNSW Index**: Hierarchical Navigable Small World graph for approximate nearest neighbor (ANN) search
- **Metadata**: Stores context like headings, page numbers, section types (useful for RAG retrieval)
- **Update Strategy**: Re-chunk and re-embed on significant document changes (background job)

---

#### `ai_conversations`

AI chat history and context management.

```sql
ai_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title             TEXT, -- Auto-generated or user-defined ("Sales Proposal Review")
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  metadata          JSONB DEFAULT '{}'::jsonb
)
```

**Indexes:**
- `idx_ai_conversations_document` on `document_id` (B-tree)
- `idx_ai_conversations_user` on `user_id` (B-tree)
- `idx_ai_conversations_updated` on `updated_at DESC` WHERE `is_active = true` (Partial index)

**Notes:**
- Represents a chat session between user and AI assistant
- Multiple conversations can exist per document (sidebar history)
- `is_active`: Allows archiving old conversations without deletion

---

#### `ai_messages`

Individual messages within AI conversations.

```sql
ai_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role              VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL,
  tokens_used       INTEGER, -- Token count for billing/analytics
  model_id          VARCHAR(50), -- "gpt-4", "claude-3-opus", etc.
  document_context  JSONB, -- Referenced document sections/chunks for RAG
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata          JSONB DEFAULT '{}'::jsonb
)
```

**Indexes:**
- `idx_ai_messages_conversation` on `conversation_id, created_at` (Composite B-tree)
- `idx_ai_messages_created` on `created_at DESC` (B-tree)

**Notes:**
- `role`: 'user' (human input), 'assistant' (AI response), 'system' (system prompt)
- `document_context`: Stores which document sections were retrieved via RAG for this message
- `tokens_used`: For cost tracking and analytics
- `metadata`: Can store additional info like streaming chunks, regeneration count, etc.

---

#### `ai_suggestions`

AI-generated suggestions applied to documents (diffs, enhancements).

```sql
ai_suggestions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
  suggestion_type   VARCHAR(30) NOT NULL CHECK (suggestion_type IN ('inline_completion', 'rewrite', 'enhancement', 'grammar', 'summary')),
  original_text     TEXT,
  suggested_text    TEXT NOT NULL,
  position_range    JSONB, -- {from: 100, to: 200}
  status            VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  metadata          JSONB DEFAULT '{}'::jsonb
)
```

**Indexes:**
- `idx_ai_suggestions_document_status` on `document_id, status` (Composite B-tree)
- `idx_ai_suggestions_user` on `user_id` (B-tree)
- `idx_ai_suggestions_created` on `created_at DESC` (B-tree)

**Notes:**
- Tracks AI suggestions that can be accepted/rejected by users
- `suggestion_type`: Different types of AI enhancements
- `status`: Lifecycle of suggestion (pending → accepted/rejected/expired)
- `position_range`: Location in document (for inline diffs)
- Expires after 7 days if not resolved (background cleanup job)

---

### 5. Comments & Annotations

#### `comments`

User comments on document sections.

```sql
comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES comments(id) ON DELETE CASCADE, -- For threaded replies
  content           TEXT NOT NULL,
  position_range    JSONB, -- {from: 100, to: 200}
  is_resolved       BOOLEAN NOT NULL DEFAULT false,
  resolved_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ, -- Soft delete
  metadata          JSONB DEFAULT '{}'::jsonb
)
```

**Indexes:**
- `idx_comments_document` on `document_id` WHERE `deleted_at IS NULL` (Partial index)
- `idx_comments_author` on `author_id` (B-tree)
- `idx_comments_parent` on `parent_id` (B-tree, for threading)
- `idx_comments_resolved` on `document_id, is_resolved` (Composite B-tree)

**Notes:**
- Supports threaded replies via `parent_id` (self-referencing foreign key)
- `position_range`: Location in document for inline comments
- `is_resolved`: Comment threads can be marked as resolved
- Soft delete for audit trail

---

### 6. Notifications & Activity

#### `notifications`

User notifications for collaboration events.

```sql
notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type              VARCHAR(50) NOT NULL CHECK (type IN ('mention', 'comment', 'share', 'edit', 'ai_suggestion', 'system')),
  title             TEXT NOT NULL,
  message           TEXT,
  document_id       UUID REFERENCES documents(id) ON DELETE CASCADE,
  actor_id          UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Who triggered the notification
  is_read           BOOLEAN NOT NULL DEFAULT false,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ, -- Optional expiration (e.g., 30 days)
  metadata          JSONB DEFAULT '{}'::jsonb
)
```

**Indexes:**
- `idx_notifications_user_unread` on `user_id` WHERE `is_read = false` (Partial index)
- `idx_notifications_created` on `created_at DESC` (B-tree)
- `idx_notifications_expires` on `expires_at` WHERE `expires_at IS NOT NULL` (Partial index, for cleanup)

**Notes:**
- `type`: Different notification categories for filtering
- `actor_id`: Who caused the notification (e.g., "John commented on your document")
- `expires_at`: Notifications can auto-expire (cleanup job deletes expired ones)
- Real-time delivery via WebSocket + fallback to polling

---

#### `activity_logs`

Audit trail for document and user actions.

```sql
activity_logs (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  document_id       UUID REFERENCES documents(id) ON DELETE SET NULL,
  action_type       VARCHAR(50) NOT NULL, -- 'document_created', 'document_edited', 'user_invited', etc.
  entity_type       VARCHAR(50), -- 'document', 'comment', 'collaborator'
  entity_id         UUID, -- ID of the affected entity
  ip_address        INET,
  user_agent        TEXT,
  metadata          JSONB DEFAULT '{}'::jsonb, -- Action-specific details
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

**Indexes:**
- `idx_activity_logs_user` on `user_id, created_at DESC` (Composite B-tree)
- `idx_activity_logs_document` on `document_id, created_at DESC` (Composite B-tree)
- `idx_activity_logs_created` on `created_at DESC` (B-tree)
- `idx_activity_logs_action_type` on `action_type` (B-tree, for analytics)

**Partitioning Strategy:**
- Partition by `created_at` (monthly) for scalability
- Archival: Move partitions older than 12 months to cold storage

**Notes:**
- Comprehensive audit trail for compliance and debugging
- `metadata`: Stores action-specific data (e.g., changed fields, old values)
- High-volume table: Consider write-optimized storage (partitioning, compression)

---

### 7. Sharing & Public Access

#### `share_links`

Public or password-protected document sharing.

```sql
share_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token             VARCHAR(64) NOT NULL UNIQUE, -- URL-safe random token
  access_level      VARCHAR(20) NOT NULL CHECK (access_level IN ('view', 'comment', 'edit')),
  password_hash     TEXT, -- Optional password protection (bcrypt hash)
  expires_at        TIMESTAMPTZ, -- Optional expiration
  max_uses          INTEGER, -- Optional usage limit
  current_uses      INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at  TIMESTAMPTZ,
  metadata          JSONB DEFAULT '{}'::jsonb
)
```

**Indexes:**
- `idx_share_links_token` on `token` (UNIQUE, B-tree)
- `idx_share_links_document_active` on `document_id` WHERE `is_active = true` (Partial index)
- `idx_share_links_expires` on `expires_at` WHERE `expires_at IS NOT NULL` (Partial index)

**Notes:**
- `token`: Random 64-char URL-safe string (e.g., `/share/abc123xyz`)
- `password_hash`: Optional password protection (bcrypt)
- `expires_at`: Share link expiration (e.g., 7 days)
- `max_uses`: Optional limit (e.g., 100 views)
- Background job deactivates expired links

---

### 8. Tags & Organization

#### `tags`

User-defined tags for document organization.

```sql
tags (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  color             VARCHAR(7), -- Hex color (#FF5733)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_tag_per_user UNIQUE (owner_id, name)
)
```

**Indexes:**
- `idx_tags_owner` on `owner_id` (B-tree)
- `idx_tags_name` on `name` (B-tree, for autocomplete)

---

#### `document_tags`

Many-to-many relationship between documents and tags.

```sql
document_tags (
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id            UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (document_id, tag_id)
)
```

**Indexes:**
- Composite primary key on `(document_id, tag_id)` (B-tree)
- `idx_document_tags_tag` on `tag_id` (B-tree, for reverse lookup)

---

### 9. System Configuration

#### `system_settings`

Global application settings (feature flags, limits, API keys).

```sql
system_settings (
  key               VARCHAR(100) PRIMARY KEY,
  value             JSONB NOT NULL,
  description       TEXT,
  is_public         BOOLEAN NOT NULL DEFAULT false, -- Can clients read this?
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        UUID REFERENCES profiles(id) ON DELETE SET NULL
)
```

**Notes:**
- `is_public`: Determines if setting can be exposed to frontend
- Examples: `max_document_size`, `ai_model_config`, `rate_limits`, `feature_flags`
- Only admins can modify (enforced via RLS policies)

---

## Performance & Indexing Strategy

### Index Types

| Index Type | Use Case | Tables |
|:-----------|:---------|:-------|
| **B-tree** | Primary keys, foreign keys, range queries, sorting | All tables |
| **HNSW** | Vector similarity search (ANN) | `document_sections.embedding` |
| **GIN** | JSONB field queries, full-text search | `documents.content`, `metadata` fields |
| **Partial** | Filtered queries (e.g., WHERE deleted_at IS NULL) | `documents`, `comments`, `notifications` |
| **Composite** | Multi-column queries (e.g., document_id + created_at) | `yjs_updates`, `ai_messages`, `activity_logs` |

### HNSW Configuration

```sql
-- HNSW index for fast vector similarity search (pgvector)
CREATE INDEX idx_document_sections_embedding_hnsw 
ON document_sections 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- m: Max connections per layer (higher = better recall, slower build)
-- ef_construction: Size of dynamic candidate list (higher = better index quality)
```

### Full-Text Search (Future Enhancement)

```sql
-- Add tsvector column for full-text search
ALTER TABLE documents ADD COLUMN content_tsv TSVECTOR;

-- Auto-update trigger
CREATE TRIGGER documents_content_tsv_update 
BEFORE INSERT OR UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION tsvector_update_trigger(content_tsv, 'pg_catalog.english', content);

-- GIN index for fast full-text search
CREATE INDEX idx_documents_content_tsv ON documents USING GIN(content_tsv);
```

---

## Security & Row Level Security (RLS)

### RLS Policies

**Principle**: Users can only access their own documents or documents explicitly shared with them.

```sql
-- Enable RLS on all user-facing tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Example: Document access policy
CREATE POLICY documents_access_policy ON documents
FOR SELECT
USING (
  owner_id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM collaborators 
    WHERE collaborators.document_id = documents.id 
    AND collaborators.user_id = auth.uid() 
    AND collaborators.is_active = true
  )
);

-- Example: Document update policy
CREATE POLICY documents_update_policy ON documents
FOR UPDATE
USING (
  owner_id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM collaborators 
    WHERE collaborators.document_id = documents.id 
    AND collaborators.user_id = auth.uid() 
    AND collaborators.role IN ('owner', 'editor')
    AND collaborators.is_active = true
  )
);
```

### Additional Security Measures

- **JWT Validation**: All requests validate Supabase JWT tokens
- **Rate Limiting**: Enforced at API Gateway level (e.g., 100 req/min per user)
- **Input Sanitization**: All text inputs sanitized to prevent XSS/SQL injection
- **Password Hashing**: bcrypt with salt for share link passwords
- **Audit Logging**: All sensitive actions logged in `activity_logs`

---

## Data Lifecycle & Maintenance

### Automated Jobs

| Job | Frequency | Action |
|:----|:----------|:-------|
| **Y.js Snapshot Consolidation** | Every 5 minutes | Apply pending `yjs_updates` to `documents.yjs_snapshot` |
| **Old Updates Cleanup** | Daily | Delete `yjs_updates` older than 30 days if `applied_to_snapshot = true` |
| **Soft Delete Cleanup** | Daily | Permanently delete documents/comments with `deleted_at` older than 30 days |
| **Session Cleanup** | Hourly | Mark `collaboration_sessions` as disconnected if `last_heartbeat` > 2 min |
| **Notification Expiration** | Daily | Delete notifications with `expires_at` in the past |
| **Share Link Expiration** | Hourly | Set `is_active = false` for `share_links` with `expires_at` in the past |
| **Activity Log Partitioning** | Monthly | Create new partition for `activity_logs`, archive old partitions |
| **Embedding Re-generation** | On document change | Re-chunk and re-embed document sections (async job) |

### Backup Strategy

- **Supabase Built-in**: Daily automated backups with point-in-time recovery (PITR)
- **Retention**: 7 days for PITR, 30 days for full backups
- **Critical Tables**: Extra backups for `documents`, `yjs_updates`, `collaborators` (before major migrations)

---

## Scalability Considerations

### Horizontal Scaling

- **Read Replicas**: Use Supabase read replicas for heavy read operations (document search, analytics)
- **Connection Pooling**: PgBouncer for efficient connection management (AWS Lambda)
- **Caching Layer**: Redis for frequently accessed data (user profiles, document metadata) - v2.0

### Partitioning

- **Time-based Partitioning**: `yjs_updates`, `activity_logs`, `ai_messages` partitioned by month
- **Archival Strategy**: Move old partitions to cold storage (S3) after 12 months

### Vector Search Optimization

- **HNSW Index Tuning**: Adjust `m` and `ef_construction` based on dataset size and query performance
- **Embedding Refresh**: Batch re-embedding during off-peak hours
- **Dimensionality**: Use `text-embedding-3-small` (1536D) for cost vs. accuracy balance

---

## Migration Strategy

### Version Control

- **Schema Migrations**: Use Supabase Migrations (SQL files in version control)
- **Naming Convention**: `YYYYMMDDHHMMSS_descriptive_name.sql` (e.g., `20260213120000_add_ai_suggestions_table.sql`)
- **Testing**: All migrations tested in staging environment before production

### Rollback Plan

- **Reversible Migrations**: Each migration includes a corresponding rollback script
- **Backup Before Migration**: Take full backup before applying major schema changes
- **Gradual Rollout**: Use feature flags to enable new features gradually

---

## Monitoring & Observability

### Key Metrics

| Metric | Threshold | Alert Action |
|:-------|:----------|:-------------|
| **Query Response Time** | > 500ms | Investigate slow queries (EXPLAIN ANALYZE) |
| **Index Hit Ratio** | < 95% | Add missing indexes |
| **Connection Pool Usage** | > 80% | Scale up connection pool |
| **Disk Space** | > 80% | Archive old data, clean up soft deletes |
| **Replication Lag** | > 30s | Check read replica health |

### Query Performance Analysis

```sql
-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 500
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND schemaname NOT LIKE 'pg_%'
ORDER BY pg_size_pretty(pg_relation_size(indexrelid)) DESC;

-- Analyze table bloat
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Vector Search & RAG

### Embedding Pipeline

1. **Document Change Detection**: Trigger on `documents.updated_at` change
2. **Text Extraction**: Convert Tiptap JSON to plain text
3. **Chunking**: Recursive character splitting (500 tokens, 100 overlap)
4. **Embedding Generation**: Call OpenAI API (`text-embedding-3-small`)
5. **Storage**: Insert/update `document_sections` with embeddings
6. **Index Update**: HNSW index auto-updates on insert

### Semantic Search Query

```sql
-- Find top 5 most similar document sections
SELECT 
  ds.id,
  ds.document_id,
  ds.content,
  ds.metadata,
  1 - (ds.embedding <=> $1::vector) AS similarity
FROM document_sections ds
WHERE ds.document_id = $2
ORDER BY ds.embedding <=> $1::vector
LIMIT 5;

-- $1: Query embedding vector (1536 dimensions)
-- $2: Document ID (optional, for scoped search)
-- <=>: Cosine distance operator (pgvector)
```

### RAG Context Building

1. **User Query**: "Improve the introduction"
2. **Query Embedding**: Generate embedding for query text
3. **Vector Search**: Find top K relevant sections (K=5-10)
4. **Context Assembly**: Combine retrieved sections with query
5. **LLM Prompt**: Send context + query to AI Service
6. **Response Streaming**: Stream AI response via SSE to frontend

---

## Schema Diagram (Simplified)

```
┌─────────────┐
│  profiles   │──┬──> documents (owner_id)
└─────────────┘  │
                 ├──> collaborators (user_id)
                 ├──> ai_conversations (user_id)
                 ├──> comments (author_id)
                 └──> notifications (user_id)

┌─────────────┐
│  documents  │──┬──> yjs_updates (document_id)
└─────────────┘  │
                 ├──> document_versions (document_id)
                 ├──> document_sections (document_id) [VECTOR EMBEDDINGS]
                 ├──> collaborators (document_id)
                 ├──> collaboration_sessions (document_id)
                 ├──> ai_conversations (document_id)
                 ├──> ai_suggestions (document_id)
                 ├──> comments (document_id)
                 ├──> share_links (document_id)
                 └──> document_tags (document_id)

┌──────────────────┐
│ ai_conversations │──> ai_messages (conversation_id)
└──────────────────┘

┌──────────────┐
│    tags      │──> document_tags (tag_id)
└──────────────┘

┌──────────────┐
│   comments   │──> comments (parent_id) [SELF-REFERENCING]
└──────────────┘
```

---

## Future Enhancements (v2.0+)

### Additional Tables

- **`workspaces`**: Multi-tenant workspace support (teams, organizations)
- **`workspace_members`**: User roles within workspaces
- **`templates`**: Pre-built document templates library
- **`export_jobs`**: Async document export (PDF, DOCX) job queue
- **`api_keys`**: User-generated API keys for programmatic access
- **`webhooks`**: Webhook subscriptions for document events
- **`billing_usage`**: Track AI token usage for billing

### Advanced Features

- **Multi-region Replication**: Geo-distributed PostgreSQL clusters
- **Graph Relationships**: Neo4j for complex document relationships (citations, references)
- **Time-series Data**: TimescaleDB extension for analytics queries
- **Full-Text Search**: Elasticsearch integration for advanced search (fuzzy matching, stemming)

---

## Connection & Query Guidelines

### Connection Pooling

- **Supabase Pooler**: Use `transaction` mode for Lambda (serverless functions)
- **Max Connections**: Configure based on expected concurrency (default: 25 per pool)
- **Connection Timeout**: 10 seconds
- **Idle Timeout**: 60 seconds

### Query Best Practices

1. **Use Prepared Statements**: Prevent SQL injection, improve performance
2. **Avoid N+1 Queries**: Use JOINs or batch queries instead of loops
3. **Limit Result Sets**: Always use LIMIT/OFFSET for pagination
4. **Index Foreign Keys**: Ensure all FK columns have indexes
5. **Analyze Query Plans**: Use EXPLAIN ANALYZE for slow queries
6. **Avoid SELECT ***: Only fetch required columns
7. **Use Transactions**: Wrap multi-step operations in transactions (ACID guarantees)

### Example: Efficient Document Loading

```sql
-- Bad: N+1 query (fetch document, then fetch collaborators in loop)
SELECT * FROM documents WHERE id = $1;
-- (then) SELECT * FROM collaborators WHERE document_id = $1;

-- Good: Single query with JOIN
SELECT 
  d.*,
  json_agg(
    json_build_object(
      'user_id', c.user_id,
      'role', c.role,
      'email', p.email,
      'full_name', p.full_name
    )
  ) AS collaborators
FROM documents d
LEFT JOIN collaborators c ON c.document_id = d.id AND c.is_active = true
LEFT JOIN profiles p ON p.id = c.user_id
WHERE d.id = $1
GROUP BY d.id;
```

---

## Conclusion

This schema provides a **robust, scalable, and secure** foundation for Caret's AI-first document editor. It supports:

- **Real-time Collaboration**: Y.js CRDT with efficient update log strategy
- **AI-Powered Features**: Vector embeddings (pgvector) for RAG, conversation history, and suggestions
- **Multi-user Access**: Fine-grained permissions (RLS), sharing, and notifications
- **Performance**: Strategic indexing (B-tree, HNSW, GIN), partitioning, and connection pooling
- **Auditability**: Comprehensive logging, soft deletes, and version history
- **Scalability**: Horizontal scaling (read replicas), partitioning, and future caching layer

All scripts and migrations will be generated based on this specification, following PostgreSQL best practices and Supabase conventions.
