"""Persist assistant tool traces on ai_messages.

Adds a JSONB ``tool_calls`` column so assistant messages can keep the ordered
list of tools used to produce the answer. This lets the frontend rehydrate the
inline tool trace when loading conversation history.

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-28 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add tool_calls to ai_messages with an empty-list default."""

    op.execute("""
        ALTER TABLE public.ai_messages
        ADD COLUMN IF NOT EXISTS tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb
    """)


def downgrade() -> None:
    """Remove the tool_calls column from ai_messages."""

    op.execute("""
        ALTER TABLE public.ai_messages
        DROP COLUMN IF EXISTS tool_calls
    """)
