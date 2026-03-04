-- Migration 002: Change workspaces.slug from text to citext
-- Requires the citext extension for case-insensitive comparisons on slugs.

-- Enable the citext extension (idempotent).
CREATE EXTENSION IF NOT EXISTS citext;

-- Alter column type from text to citext.
-- Existing data is preserved; citext is binary-compatible with text.
ALTER TABLE workspaces ALTER COLUMN slug TYPE citext;
