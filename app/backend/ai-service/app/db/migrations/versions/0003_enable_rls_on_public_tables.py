"""Enable RLS on AI-service public tables exposed through Supabase.

This migration addresses Supabase Security Advisor findings for public tables
owned by the AI service:
  - ai_conversations
  - ai_messages
  - ai_suggestions
  - document_embeddings
  - alembic_version

Policy design:
  - AI chat tables are user-scoped. The authenticated user may only access
    rows owned by their own conversation chain.
  - document_embeddings and alembic_version should not be queried directly
    from client credentials, so RLS is enabled without client policies.

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-15 00:30:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Enable RLS and create owner-scoped policies for AI tables."""

    # -----------------------------------------------------------------------
    # Enable RLS on all Supabase-exposed public tables owned by this service.
    # -----------------------------------------------------------------------
    op.execute("ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.document_embeddings ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.alembic_version ENABLE ROW LEVEL SECURITY")

    # -----------------------------------------------------------------------
    # ai_conversations
    # -----------------------------------------------------------------------
    op.execute("DROP POLICY IF EXISTS ai_conversations_select_own ON public.ai_conversations")
    op.execute("DROP POLICY IF EXISTS ai_conversations_insert_own ON public.ai_conversations")
    op.execute("DROP POLICY IF EXISTS ai_conversations_update_own ON public.ai_conversations")
    op.execute("DROP POLICY IF EXISTS ai_conversations_delete_own ON public.ai_conversations")

    op.execute("""
        CREATE POLICY ai_conversations_select_own
          ON public.ai_conversations
          FOR SELECT
          USING (user_id = auth.uid())
    """)
    op.execute("""
        CREATE POLICY ai_conversations_insert_own
          ON public.ai_conversations
          FOR INSERT
          WITH CHECK (user_id = auth.uid())
    """)
    op.execute("""
        CREATE POLICY ai_conversations_update_own
          ON public.ai_conversations
          FOR UPDATE
          USING (user_id = auth.uid())
          WITH CHECK (user_id = auth.uid())
    """)
    op.execute("""
        CREATE POLICY ai_conversations_delete_own
          ON public.ai_conversations
          FOR DELETE
          USING (user_id = auth.uid())
    """)

    # -----------------------------------------------------------------------
    # ai_messages
    # -----------------------------------------------------------------------
    op.execute("DROP POLICY IF EXISTS ai_messages_select_via_owner ON public.ai_messages")
    op.execute("DROP POLICY IF EXISTS ai_messages_insert_via_owner ON public.ai_messages")
    op.execute("DROP POLICY IF EXISTS ai_messages_update_via_owner ON public.ai_messages")
    op.execute("DROP POLICY IF EXISTS ai_messages_delete_via_owner ON public.ai_messages")

    op.execute("""
        CREATE POLICY ai_messages_select_via_owner
          ON public.ai_messages
          FOR SELECT
          USING (
            EXISTS (
              SELECT 1
              FROM public.ai_conversations conversation
              WHERE conversation.id = ai_messages.conversation_id
                AND conversation.user_id = auth.uid()
            )
          )
    """)
    op.execute("""
        CREATE POLICY ai_messages_insert_via_owner
          ON public.ai_messages
          FOR INSERT
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM public.ai_conversations conversation
              WHERE conversation.id = ai_messages.conversation_id
                AND conversation.user_id = auth.uid()
            )
          )
    """)
    op.execute("""
        CREATE POLICY ai_messages_update_via_owner
          ON public.ai_messages
          FOR UPDATE
          USING (
            EXISTS (
              SELECT 1
              FROM public.ai_conversations conversation
              WHERE conversation.id = ai_messages.conversation_id
                AND conversation.user_id = auth.uid()
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM public.ai_conversations conversation
              WHERE conversation.id = ai_messages.conversation_id
                AND conversation.user_id = auth.uid()
            )
          )
    """)
    op.execute("""
        CREATE POLICY ai_messages_delete_via_owner
          ON public.ai_messages
          FOR DELETE
          USING (
            EXISTS (
              SELECT 1
              FROM public.ai_conversations conversation
              WHERE conversation.id = ai_messages.conversation_id
                AND conversation.user_id = auth.uid()
            )
          )
    """)

    # -----------------------------------------------------------------------
    # ai_suggestions
    # -----------------------------------------------------------------------
    op.execute("DROP POLICY IF EXISTS ai_suggestions_select_via_owner ON public.ai_suggestions")
    op.execute("DROP POLICY IF EXISTS ai_suggestions_insert_via_owner ON public.ai_suggestions")
    op.execute("DROP POLICY IF EXISTS ai_suggestions_update_via_owner ON public.ai_suggestions")
    op.execute("DROP POLICY IF EXISTS ai_suggestions_delete_via_owner ON public.ai_suggestions")

    op.execute("""
        CREATE POLICY ai_suggestions_select_via_owner
          ON public.ai_suggestions
          FOR SELECT
          USING (
            EXISTS (
              SELECT 1
              FROM public.ai_conversations conversation
              WHERE conversation.id = ai_suggestions.conversation_id
                AND conversation.user_id = auth.uid()
            )
          )
    """)
    op.execute("""
        CREATE POLICY ai_suggestions_insert_via_owner
          ON public.ai_suggestions
          FOR INSERT
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM public.ai_conversations conversation
              WHERE conversation.id = ai_suggestions.conversation_id
                AND conversation.user_id = auth.uid()
                AND conversation.document_id = ai_suggestions.document_id
            )
          )
    """)
    op.execute("""
        CREATE POLICY ai_suggestions_update_via_owner
          ON public.ai_suggestions
          FOR UPDATE
          USING (
            EXISTS (
              SELECT 1
              FROM public.ai_conversations conversation
              WHERE conversation.id = ai_suggestions.conversation_id
                AND conversation.user_id = auth.uid()
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM public.ai_conversations conversation
              WHERE conversation.id = ai_suggestions.conversation_id
                AND conversation.user_id = auth.uid()
                AND conversation.document_id = ai_suggestions.document_id
            )
          )
    """)
    op.execute("""
        CREATE POLICY ai_suggestions_delete_via_owner
          ON public.ai_suggestions
          FOR DELETE
          USING (
            EXISTS (
              SELECT 1
              FROM public.ai_conversations conversation
              WHERE conversation.id = ai_suggestions.conversation_id
                AND conversation.user_id = auth.uid()
            )
          )
    """)


def downgrade() -> None:
    """Drop RLS policies and disable RLS for the affected public tables."""

    op.execute("DROP POLICY IF EXISTS ai_suggestions_delete_via_owner ON public.ai_suggestions")
    op.execute("DROP POLICY IF EXISTS ai_suggestions_update_via_owner ON public.ai_suggestions")
    op.execute("DROP POLICY IF EXISTS ai_suggestions_insert_via_owner ON public.ai_suggestions")
    op.execute("DROP POLICY IF EXISTS ai_suggestions_select_via_owner ON public.ai_suggestions")

    op.execute("DROP POLICY IF EXISTS ai_messages_delete_via_owner ON public.ai_messages")
    op.execute("DROP POLICY IF EXISTS ai_messages_update_via_owner ON public.ai_messages")
    op.execute("DROP POLICY IF EXISTS ai_messages_insert_via_owner ON public.ai_messages")
    op.execute("DROP POLICY IF EXISTS ai_messages_select_via_owner ON public.ai_messages")

    op.execute("DROP POLICY IF EXISTS ai_conversations_delete_own ON public.ai_conversations")
    op.execute("DROP POLICY IF EXISTS ai_conversations_update_own ON public.ai_conversations")
    op.execute("DROP POLICY IF EXISTS ai_conversations_insert_own ON public.ai_conversations")
    op.execute("DROP POLICY IF EXISTS ai_conversations_select_own ON public.ai_conversations")

    op.execute("ALTER TABLE public.alembic_version DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.document_embeddings DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.ai_suggestions DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.ai_messages DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.ai_conversations DISABLE ROW LEVEL SECURITY")
