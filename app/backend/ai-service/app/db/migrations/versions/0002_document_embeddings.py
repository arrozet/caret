"""Add document_embeddings table with pgvector HNSW index for Phase 4 RAG.

Creates the document_embeddings table that stores chunk-level text embeddings
(text-embedding-3-small, 1536 dimensions) with an HNSW index for approximate
nearest-neighbour search.

Requires the ``vector`` PostgreSQL extension (pgvector).  If running against
Supabase, this extension is pre-installed; otherwise run:
    CREATE EXTENSION IF NOT EXISTS vector;

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-15 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create document_embeddings table and HNSW index."""

    # Ensure the pgvector extension is available
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute("""
        CREATE TABLE IF NOT EXISTS public.document_embeddings (
            id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            document_id   UUID        NOT NULL,
            chunk_index   INTEGER     NOT NULL,
            chunk_text    TEXT        NOT NULL,
            embedding     vector(1536) NOT NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT fk_document_embeddings_document_id
                FOREIGN KEY (document_id)
                REFERENCES public.documents(id)
                ON DELETE CASCADE
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id
            ON public.document_embeddings (document_id)
    """)

    # HNSW index for approximate nearest-neighbour cosine similarity search.
    # m=16 and ef_construction=64 are the pgvector recommended defaults.
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_document_embeddings_hnsw
            ON public.document_embeddings
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
    """)

    # Unique constraint to prevent duplicate chunk indexes per document
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_document_embeddings_document_chunk
            ON public.document_embeddings (document_id, chunk_index)
    """)


def downgrade() -> None:
    """Drop the document_embeddings table."""
    op.execute("DROP TABLE IF EXISTS public.document_embeddings CASCADE")
