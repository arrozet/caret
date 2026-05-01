"""Add workspace scoping to document embeddings.

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-30 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Backfill workspace_id from public.documents and add workspace indexes."""

    op.execute("""
        ALTER TABLE public.document_embeddings
        ADD COLUMN IF NOT EXISTS workspace_id UUID
    """)

    op.execute("""
        UPDATE public.document_embeddings AS de
        SET workspace_id = d.workspace_id
        FROM public.documents AS d
        WHERE d.id = de.document_id
          AND de.workspace_id IS NULL
    """)

    op.execute("""
        ALTER TABLE public.document_embeddings
        ALTER COLUMN workspace_id SET NOT NULL
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_document_embeddings_workspace_id
            ON public.document_embeddings (workspace_id)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_document_embeddings_workspace_document
            ON public.document_embeddings (workspace_id, document_id)
    """)


def downgrade() -> None:
    """Remove the workspace-scoping column and indexes from document_embeddings."""

    op.execute("DROP INDEX IF EXISTS public.idx_document_embeddings_workspace_document")
    op.execute("DROP INDEX IF EXISTS public.idx_document_embeddings_workspace_id")
    op.execute("ALTER TABLE public.document_embeddings DROP COLUMN IF EXISTS workspace_id")
