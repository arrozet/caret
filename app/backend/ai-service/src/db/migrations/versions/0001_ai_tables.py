"""Create AI tables: ai_conversations, ai_messages, ai_suggestions.

Creates the three core tables required by Phase 3 of the Caret roadmap,
together with their PostgreSQL ENUM types, foreign-key constraints, and
performance indexes.  Requires the ``documents`` table (from the
document-service Drizzle migration) to already exist in the database.

Implementation note: ENUM types and tables are created via raw SQL
(op.execute) rather than SQLAlchemy's op.create_table.  When op.create_table
is used with Enum columns, SQLAlchemy's internal event system fires
_on_table_create on every Enum object with a matching name — including those
imported via target_metadata from the ORM models in env.py — with
checkfirst=False.  This causes DuplicateObjectError on any re-run or on
existing ENUMs.  Using raw SQL sidesteps the event system entirely and also
allows IF NOT EXISTS / DO $$ EXCEPTION $$ guards to make the migration safe
to run multiple times (idempotent).

Revision ID: 0001
Revises:
Create Date: 2026-03-04 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

# ---------------------------------------------------------------------------
# Revision identifiers
# ---------------------------------------------------------------------------

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    """Create ENUMs and tables for the AI brain feature (Phase 3)."""

    # -- ENUM types ----------------------------------------------------------
    # PostgreSQL has no IF NOT EXISTS for CREATE TYPE, so we use a DO block
    # that catches duplicate_object and silently continues.
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE public.ai_message_role AS ENUM (
                'system', 'user', 'assistant', 'tool'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE public.ai_suggestion_status AS ENUM (
                'proposed', 'applied', 'dismissed', 'superseded'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # -- ai_conversations ----------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.ai_conversations (
            id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            document_id UUID        NOT NULL,
            user_id     UUID        NOT NULL,
            title       TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT fk_ai_conversations_document_id
                FOREIGN KEY (document_id)
                REFERENCES public.documents(id)
                ON DELETE CASCADE
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ai_conversations_document_id
            ON public.ai_conversations (document_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id
            ON public.ai_conversations (user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_document
            ON public.ai_conversations (user_id, document_id)
    """)

    # -- ai_messages ---------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.ai_messages (
            id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID                    NOT NULL,
            role            public.ai_message_role  NOT NULL,
            content         TEXT                    NOT NULL,
            token_count     INTEGER,
            created_at      TIMESTAMPTZ             NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ             NOT NULL DEFAULT now(),
            CONSTRAINT fk_ai_messages_conversation_id
                FOREIGN KEY (conversation_id)
                REFERENCES public.ai_conversations(id)
                ON DELETE CASCADE
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id
            ON public.ai_messages (conversation_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created
            ON public.ai_messages (conversation_id, created_at)
    """)

    # -- ai_suggestions ------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.ai_suggestions (
            id              UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID                        NOT NULL,
            document_id     UUID                        NOT NULL,
            message_id      UUID,
            status          public.ai_suggestion_status NOT NULL DEFAULT 'proposed',
            original_text   TEXT,
            suggested_text  TEXT                        NOT NULL,
            position_start  BIGINT,
            position_end    BIGINT,
            created_at      TIMESTAMPTZ                 NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ                 NOT NULL DEFAULT now(),
            CONSTRAINT fk_ai_suggestions_conversation_id
                FOREIGN KEY (conversation_id)
                REFERENCES public.ai_conversations(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_ai_suggestions_document_id
                FOREIGN KEY (document_id)
                REFERENCES public.documents(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_ai_suggestions_message_id
                FOREIGN KEY (message_id)
                REFERENCES public.ai_messages(id)
                ON DELETE SET NULL
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ai_suggestions_conversation_id
            ON public.ai_suggestions (conversation_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ai_suggestions_document_id
            ON public.ai_suggestions (document_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status
            ON public.ai_suggestions (conversation_id, status)
    """)


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------


def downgrade() -> None:
    """Drop all AI tables and ENUM types created in upgrade()."""
    op.execute("DROP TABLE IF EXISTS public.ai_suggestions CASCADE")
    op.execute("DROP TABLE IF EXISTS public.ai_messages CASCADE")
    op.execute("DROP TABLE IF EXISTS public.ai_conversations CASCADE")
    op.execute("DROP TYPE IF EXISTS public.ai_suggestion_status")
    op.execute("DROP TYPE IF EXISTS public.ai_message_role")
