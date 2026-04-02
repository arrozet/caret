-- =============================================================================
-- RLS policies for collaboration tables
-- =============================================================================
--
-- These policies use Supabase's auth.uid() to enforce row-level security
-- for client-side access via the anon key. Backend services connect as the
-- postgres/service role and bypass RLS automatically.
--
-- Tables covered:
--   - document_collab_updates
--   - document_collab_snapshots
--
-- Access model:
--   - Users can read/write collab data for documents they have editor+ access to
--   - Document access is determined by:
--     1. Being a document_member with editor/owner role
--     2. Being a workspace owner/admin (override)
--   - Read-only access (viewer/commenter roles) does NOT grant collab access
--     because collab implies real-time editing capability
--
-- Convention: policy names follow the pattern
--   <table>_<operation>_<description>
--
-- Prerequisite: 
--   - Supabase Auth must be configured with auth.uid() available
--   - documents, document_members, workspace_members tables must exist
--   - This migration runs AFTER the Drizzle-generated table creation
-- =============================================================================

-- =============================================================================
-- Helper function: check if user can collaborate on a document
-- =============================================================================
-- 
-- Returns TRUE if the user has edit access to the document.
-- This centralizes the access check logic for both tables.
--
CREATE OR REPLACE FUNCTION can_collaborate_on_document(doc_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    -- User is a document member with editor or owner role
    SELECT 1 FROM document_members dm
    WHERE dm.document_id = doc_id
      AND dm.user_id = auth.uid()
      AND dm.role IN ('owner', 'editor')
  )
  OR EXISTS (
    -- User is a workspace owner or admin (always has edit access)
    SELECT 1 FROM documents d
    JOIN workspace_members wm ON wm.workspace_id = d.workspace_id
    WHERE d.id = doc_id
      AND wm.user_id = auth.uid()
      AND wm.revoked_at IS NULL
      AND wm.role IN ('owner', 'admin')
  )
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION can_collaborate_on_document(uuid) TO authenticated;

-- =============================================================================
-- 1) document_collab_updates
-- =============================================================================

ALTER TABLE document_collab_updates ENABLE ROW LEVEL SECURITY;

-- Users can read updates for documents they can collaborate on
CREATE POLICY document_collab_updates_select
  ON document_collab_updates FOR SELECT
  USING (can_collaborate_on_document(document_id));

-- Users can insert updates for documents they can collaborate on
-- Note: The seq value should be validated by the application layer
CREATE POLICY document_collab_updates_insert
  ON document_collab_updates FOR INSERT
  WITH CHECK (can_collaborate_on_document(document_id));

-- Updates are append-only and immutable — no UPDATE policy
-- Compaction (DELETE) is handled by the backend service role, not client-side

-- =============================================================================
-- 2) document_collab_snapshots
-- =============================================================================

ALTER TABLE document_collab_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can read snapshots for documents they can collaborate on
CREATE POLICY document_collab_snapshots_select
  ON document_collab_snapshots FOR SELECT
  USING (can_collaborate_on_document(document_id));

-- Users can create snapshots for documents they can collaborate on
-- Note: Typically only the server creates snapshots, but allowing client-side
-- for offline/resilience scenarios
CREATE POLICY document_collab_snapshots_insert
  ON document_collab_snapshots FOR INSERT
  WITH CHECK (can_collaborate_on_document(document_id));

-- Snapshots are immutable — no UPDATE policy
-- Cleanup (DELETE) is handled by the backend service role, not client-side

-- =============================================================================
-- Notes on service-level access
-- =============================================================================
--
-- The collab-service connects using the Supabase service_role key or a
-- dedicated postgres user with BYPASSRLS privilege. This allows the service to:
--   - Perform batch inserts without per-row RLS checks (performance)
--   - Run compaction jobs that delete old updates/snapshots
--   - Access documents on behalf of users during WebSocket sync
--
-- For WebSocket connections, the service validates the JWT token and checks
-- document access in application code before performing any database operations.
-- =============================================================================
