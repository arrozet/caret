-- =============================================================================
-- Drop unused application-level user profiles table
-- =============================================================================
--
-- Caret now relies exclusively on Supabase Auth (`auth.users`) for identity.
-- The old `public.user_profiles` table is no longer populated or read.
--
-- =============================================================================

DROP TABLE IF EXISTS public.user_profiles CASCADE;
