"""
SQLAlchemy ORM models for the AI Service.

Tables:
  - ai_conversations  : one conversation per (user, document) session
  - ai_messages       : individual chat turns (system/user/assistant/tool)
  - ai_suggestions    : AI-generated text proposals with apply/dismiss lifecycle

Rule: these are DB-layer types used exclusively in Repositories.
Rule: never return SQLAlchemy models directly from a Router — map to Pydantic schemas first.
"""

import enum
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    ForeignKey,
    Integer,
    Text,
    text,
)
from sqlalchemy import (
    Enum as SAEnum,
)

# NOTE: the `documents` table is owned by the document-service and is not
# present in this service's SQLAlchemy metadata.  Cross-service FKs to
# documents.id are enforced at the database level (via Alembic migrations)
# but must NOT appear in the ORM model here — SQLAlchemy would try to resolve
# them against the local metadata and raise NoReferencedTableError at startup.
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TIMESTAMP

# ---------------------------------------------------------------------------
# Declarative base
# ---------------------------------------------------------------------------


class Base(DeclarativeBase):
    """Shared declarative base for all AI-service ORM models."""


# ---------------------------------------------------------------------------
# Enumerations  (mirror the PostgreSQL ENUM types)
# ---------------------------------------------------------------------------


class AiMessageRole(enum.StrEnum):
    """Allowed roles for ai_messages.role (maps to PostgreSQL ENUM)."""

    system = "system"
    user = "user"
    assistant = "assistant"
    tool = "tool"


class AiSuggestionStatus(enum.StrEnum):
    """Lifecycle states for ai_suggestions.status (maps to PostgreSQL ENUM)."""

    proposed = "proposed"
    applied = "applied"
    dismissed = "dismissed"
    superseded = "superseded"


# ---------------------------------------------------------------------------
# ai_conversations
# ---------------------------------------------------------------------------


class AiConversation(Base):
    """
    Represents a single AI chat session scoped to one document and user.

    One conversation holds an ordered list of messages and zero or more
    AI-generated text suggestions.
    """

    __tablename__ = "ai_conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    # FK to documents.id is enforced in the DB but intentionally omitted from
    # the ORM model — the documents table lives in a different service.
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    title: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships (lazy="selectin" to avoid N+1 in list queries)
    messages: Mapped[list["AiMessage"]] = relationship(
        "AiMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AiMessage.created_at",
        lazy="selectin",
    )
    suggestions: Mapped[list["AiSuggestion"]] = relationship(
        "AiSuggestion",
        back_populates="conversation",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


# ---------------------------------------------------------------------------
# ai_messages
# ---------------------------------------------------------------------------


class AiMessage(Base):
    """
    A single chat turn within an AiConversation.

    Stores the role (system/user/assistant/tool) and the raw text content.
    token_count is optionally populated after the LLM call for cost tracking.
    """

    __tablename__ = "ai_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[AiMessageRole] = mapped_column(
        SAEnum(AiMessageRole, name="ai_message_role", create_type=False),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    conversation: Mapped["AiConversation"] = relationship(
        "AiConversation",
        back_populates="messages",
    )
    suggestion: Mapped["AiSuggestion | None"] = relationship(
        "AiSuggestion",
        back_populates="message",
        uselist=False,
    )


# ---------------------------------------------------------------------------
# ai_suggestions
# ---------------------------------------------------------------------------


class AiSuggestion(Base):
    """
    An AI-generated text proposal attached to a conversation and document.

    Tracks the full lifecycle from proposed → applied/dismissed/superseded.
    position_start / position_end refer to character offsets inside the
    Tiptap document at the time the suggestion was generated.
    """

    __tablename__ = "ai_suggestions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # FK to documents.id is enforced in the DB but intentionally omitted from
    # the ORM model — the documents table lives in a different service.
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[AiSuggestionStatus] = mapped_column(
        SAEnum(AiSuggestionStatus, name="ai_suggestion_status", create_type=False),
        nullable=False,
        default=AiSuggestionStatus.proposed,
        index=True,
    )
    original_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_text: Mapped[str] = mapped_column(Text, nullable=False)
    position_start: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    position_end: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    created_at: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    conversation: Mapped["AiConversation"] = relationship(
        "AiConversation",
        back_populates="suggestions",
    )
    message: Mapped["AiMessage | None"] = relationship(
        "AiMessage",
        back_populates="suggestion",
    )


# ---------------------------------------------------------------------------
# document_embeddings
# ---------------------------------------------------------------------------


class DocumentEmbedding(Base):
    """
    Stores a single text chunk from a document with its vector embedding.

    The document is split into overlapping chunks; each chunk is embedded
    via the OpenAI text-embedding-3-small model and stored as a pgvector
    Vector(1536) column.  The HNSW index on `embedding` enables sub-linear
    approximate nearest-neighbour (ANN) search for RAG retrieval.

    Columns:
        id           : UUID primary key.
        document_id  : FK to documents.id (enforced in DB, omitted from ORM).
        chunk_index  : Zero-based position of this chunk in the document.
        chunk_text   : The raw text of the chunk.
        embedding    : 1536-dimensional float32 vector (pgvector).
        created_at   : Row creation timestamp.
        updated_at   : Row last-update timestamp.
    """

    __tablename__ = "document_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    chunk_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(
        Vector(1536),
        nullable=False,
    )

    created_at: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[TIMESTAMP] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
