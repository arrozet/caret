-- =============================================================================
-- RLS policies for Phase 2 core tables
-- =============================================================================
--
-- These policies use Supabase's auth.uid() to enforce row-level security
-- for client-side access via the anon key. Backend services connect as the
-- postgres/service role and bypass RLS automatically.
--
-- Tables covered:
--   - workspaces
--   - workspace_members
--   - folders
--   - documents
--   - document_members
--   - document_versions
--   - user_profiles
--
-- Convention: policy names follow the pattern
--   <table>_<operation>_<description>
--
-- Prerequisite: Supabase Auth must be configured and auth.uid() must be
-- available in the request context (set automatically by Supabase client SDK).
-- =============================================================================

-- =============================================================================
-- 1) user_profiles
-- =============================================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY user_profiles_select_own
  ON user_profiles FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own profile
CREATE POLICY user_profiles_update_own
  ON user_profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can insert their own profile (signup flow)
CREATE POLICY user_profiles_insert_own
  ON user_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- 2) workspaces
-- =============================================================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Users can see workspaces they are active members of
CREATE POLICY workspaces_select_member
  ON workspaces FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
    )
  );

-- Any authenticated user can create a workspace
CREATE POLICY workspaces_insert_authenticated
  ON workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Only workspace owners and admins can update the workspace
CREATE POLICY workspaces_update_owner_admin
  ON workspaces FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Only workspace owners can soft-delete (update deleted_at)
-- Note: hard DELETE is not exposed via the API; soft-delete is an UPDATE.
-- If needed, a DELETE policy can be added for cleanup jobs.
CREATE POLICY workspaces_delete_owner
  ON workspaces FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role = 'owner'
    )
  );

-- =============================================================================
-- 3) workspace_members
-- =============================================================================

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members of workspaces they belong to
CREATE POLICY workspace_members_select_member
  ON workspace_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
    )
  );

-- The workspace creator can insert the initial owner membership.
-- Owners and admins can invite new members.
CREATE POLICY workspace_members_insert_owner_admin
  ON workspace_members FOR INSERT
  WITH CHECK (
    -- Allow self-insert as owner (workspace creation flow)
    (user_id = auth.uid())
    OR
    -- Allow owners/admins to add other members
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Owners and admins can update member roles or revoke membership
CREATE POLICY workspace_members_update_owner_admin
  ON workspace_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Only owners can hard-delete membership records (rare cleanup)
CREATE POLICY workspace_members_delete_owner
  ON workspace_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role = 'owner'
    )
  );

-- =============================================================================
-- 4) folders
-- =============================================================================

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- Active workspace members can view folders in their workspaces
CREATE POLICY folders_select_member
  ON folders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = folders.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
    )
  );

-- Owners, admins, and members can create folders (guests cannot)
CREATE POLICY folders_insert_member
  ON folders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = folders.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );

-- Owners, admins, and members can update folders
CREATE POLICY folders_update_member
  ON folders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = folders.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = folders.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );

-- Owners and admins can delete folders
CREATE POLICY folders_delete_owner_admin
  ON folders FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = folders.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- 5) documents
-- =============================================================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Users can see documents in workspaces they belong to, respecting visibility:
--   - workspace/public/link visibility: any workspace member can see
--   - private: only document members or workspace owner/admin can see
CREATE POLICY documents_select_member
  ON documents FOR SELECT
  USING (
    -- Non-private documents: any active workspace member
    (
      visibility IN ('workspace', 'public', 'link')
      AND EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = documents.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.revoked_at IS NULL
      )
    )
    OR
    -- Private documents: must be a document member
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = documents.id
        AND dm.user_id = auth.uid()
    )
    OR
    -- Workspace owners/admins can always see all documents
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Owners, admins, and members can create documents
CREATE POLICY documents_insert_member
  ON documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );

-- Document owners/editors or workspace owners/admins can update
CREATE POLICY documents_update_editor
  ON documents FOR UPDATE
  USING (
    -- Document member with owner/editor role
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = documents.id
        AND dm.user_id = auth.uid()
        AND dm.role IN ('owner', 'editor')
    )
    OR
    -- Workspace owner/admin override
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = documents.id
        AND dm.user_id = auth.uid()
        AND dm.role IN ('owner', 'editor')
    )
    OR
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Workspace owners and admins can delete documents
CREATE POLICY documents_delete_owner_admin
  ON documents FOR DELETE
  USING (
    -- Document owner
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = documents.id
        AND dm.user_id = auth.uid()
        AND dm.role = 'owner'
    )
    OR
    -- Workspace owner/admin
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- 6) document_members
-- =============================================================================

ALTER TABLE document_members ENABLE ROW LEVEL SECURITY;

-- Users can see document memberships if they are a member of the document
-- or a workspace owner/admin
CREATE POLICY document_members_select
  ON document_members FOR SELECT
  USING (
    -- You are a member of this document
    EXISTS (
      SELECT 1 FROM document_members dm2
      WHERE dm2.document_id = document_members.document_id
        AND dm2.user_id = auth.uid()
    )
    OR
    -- You are a workspace owner/admin
    EXISTS (
      SELECT 1 FROM documents d
      JOIN workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_members.document_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Document owners or workspace owners/admins can add members
CREATE POLICY document_members_insert
  ON document_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = document_members.document_id
        AND dm.user_id = auth.uid()
        AND dm.role = 'owner'
    )
    OR
    EXISTS (
      SELECT 1 FROM documents d
      JOIN workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_members.document_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Document owners or workspace owners/admins can update roles
CREATE POLICY document_members_update
  ON document_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = document_members.document_id
        AND dm.user_id = auth.uid()
        AND dm.role = 'owner'
    )
    OR
    EXISTS (
      SELECT 1 FROM documents d
      JOIN workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_members.document_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = document_members.document_id
        AND dm.user_id = auth.uid()
        AND dm.role = 'owner'
    )
    OR
    EXISTS (
      SELECT 1 FROM documents d
      JOIN workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_members.document_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Document owners or workspace owners/admins can remove members
CREATE POLICY document_members_delete
  ON document_members FOR DELETE
  USING (
    -- Self-removal (user leaving)
    user_id = auth.uid()
    OR
    -- Document owner
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = document_members.document_id
        AND dm.user_id = auth.uid()
        AND dm.role = 'owner'
    )
    OR
    -- Workspace owner/admin
    EXISTS (
      SELECT 1 FROM documents d
      JOIN workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_members.document_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- 7) document_versions
-- =============================================================================

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

-- Users can read versions of documents they have access to
-- (inherits the same access logic as documents)
CREATE POLICY document_versions_select
  ON document_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_versions.document_id
        AND (
          -- Non-private: any workspace member
          (
            d.visibility IN ('workspace', 'public', 'link')
            AND EXISTS (
              SELECT 1 FROM workspace_members wm
              WHERE wm.workspace_id = d.workspace_id
                AND wm.user_id = auth.uid()
                AND wm.revoked_at IS NULL
            )
          )
          OR
          -- Document member
          EXISTS (
            SELECT 1 FROM document_members dm
            WHERE dm.document_id = d.id
              AND dm.user_id = auth.uid()
          )
          OR
          -- Workspace owner/admin
          EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = d.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.revoked_at IS NULL
              AND wm.role IN ('owner', 'admin')
          )
        )
    )
  );

-- Document editors/owners or workspace owners/admins can create versions
CREATE POLICY document_versions_insert
  ON document_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM document_members dm
      WHERE dm.document_id = document_versions.document_id
        AND dm.user_id = auth.uid()
        AND dm.role IN ('owner', 'editor')
    )
    OR
    EXISTS (
      SELECT 1 FROM documents d
      JOIN workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_versions.document_id
        AND wm.user_id = auth.uid()
        AND wm.revoked_at IS NULL
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Versions are immutable — no UPDATE policy
-- Versions cascade-delete with documents — no separate DELETE policy needed
