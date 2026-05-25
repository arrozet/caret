-- =============================================================================
-- Re-create user_profiles table
-- =============================================================================
--
-- Migration 003 dropped user_profiles when Caret relied exclusively on
-- auth.users for identity. However, OAuth providers (Google) overwrite
-- user_metadata on each login, losing any profile customizations.
--
-- This migration re-creates the table so profile edits persist across
-- OAuth re-authentication.
--
-- =============================================================================

CREATE TABLE public.user_profiles (
  user_id     uuid        PRIMARY KEY NOT NULL,
  display_name text,
  avatar_url  text,
  locale      text,
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL,
  deleted_at  timestamptz
);

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

-- Users can insert their own profile
CREATE POLICY user_profiles_insert_own
  ON user_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());
