"""
Pydantic schemas (DTOs) for the AI Service API.

Schemas are the only types that cross the HTTP boundary — they are never
persisted to the database directly.  SQLAlchemy models live in app/models/.

Naming convention:
  <Resource>Create   — request body for POST endpoints
  <Resource>Update   — request body for PATCH endpoints
  <Resource>Response — response body (read-only, safe to serialise)
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.ai import AiMessageRole, AiSuggestionStatus


# ---------------------------------------------------------------------------
# Shared config
# ---------------------------------------------------------------------------


class _TimestampedResponse(BaseModel):
    """Mixin that adds ISO-8601 timestamps to every response schema."""

    model_config = ConfigDict(from_attributes=True)

    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# ai_conversations
# ---------------------------------------------------------------------------


class ConversationCreate(BaseModel):
    """Request body for POST /conversations."""

    document_id: uuid.UUID = Field(
        ..., description="UUID of the document this conversation is attached to."
    )
    title: str | None = Field(
        default=None,
        max_length=255,
        description="Optional human-readable title. Auto-generated if omitted.",
    )


class ConversationResponse(_TimestampedResponse):
    """
    Full representation of an ai_conversation row returned to the client.
    Includes the ordered message list (populated via selectin loading).
    """

    id: uuid.UUID
    document_id: uuid.UUID
    user_id: uuid.UUID
    title: str | None


class ConversationListResponse(BaseModel):
    """Paginated list of conversations."""

    model_config = ConfigDict(from_attributes=True)

    items: list[ConversationResponse]
    total: int


# ---------------------------------------------------------------------------
# ai_messages
# ---------------------------------------------------------------------------


class MessageCreate(BaseModel):
    """Request body when the client sends a user message."""

    content: str = Field(..., min_length=1, max_length=32_000)
    role: AiMessageRole = Field(
        default=AiMessageRole.user,
        description="Typically 'user'. System messages are created internally.",
    )


class MessageResponse(_TimestampedResponse):
    """A single chat turn returned to the client."""

    id: uuid.UUID
    conversation_id: uuid.UUID
    role: AiMessageRole
    content: str
    token_count: int | None


class MessageListResponse(BaseModel):
    """Ordered list of messages in a conversation."""

    model_config = ConfigDict(from_attributes=True)

    items: list[MessageResponse]
    total: int


# ---------------------------------------------------------------------------
# ai_suggestions
# ---------------------------------------------------------------------------


class SuggestionCreate(BaseModel):
    """Internal schema used by the agent service to persist a new suggestion."""

    document_id: uuid.UUID
    message_id: uuid.UUID | None = None
    original_text: str | None = None
    suggested_text: str = Field(..., min_length=1)
    position_start: int | None = None
    position_end: int | None = None


class SuggestionStatusUpdate(BaseModel):
    """Request body for PATCH /suggestions/{id} — update lifecycle status."""

    status: AiSuggestionStatus


class SuggestionResponse(_TimestampedResponse):
    """Full suggestion representation returned to the client."""

    id: uuid.UUID
    conversation_id: uuid.UUID
    document_id: uuid.UUID
    message_id: uuid.UUID | None
    status: AiSuggestionStatus
    original_text: str | None
    suggested_text: str
    position_start: int | None
    position_end: int | None


# ---------------------------------------------------------------------------
# Models catalog
# ---------------------------------------------------------------------------


class ModelInfo(BaseModel):
    """A single selectable LLM model returned by GET /ai/models."""

    id: str = Field(..., description="OpenRouter model slug (e.g. 'z-ai/glm-4.5-air:free').")
    name: str = Field(..., description="Human-readable display name.")
    provider: str = Field(..., description="Upstream provider name.")
    is_free: bool = Field(..., description="True when the model has no API cost on OpenRouter.")
    context_window: int = Field(..., description="Maximum context window in tokens.")
    description: str = Field(..., description="Short one-line description.")


class ModelsResponse(BaseModel):
    """Response body for GET /ai/models."""

    models: list[ModelInfo]
    default_model_id: str = Field(
        ..., description="The model_id that will be used when none is specified."
    )


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------


class StreamRequest(BaseModel):
    """
    Request body for POST /conversations/{id}/stream.

    The client sends the latest user message; the service streams the
    assistant reply back as SSE text/event-stream chunks.
    """

    message: str = Field(..., min_length=1, max_length=32_000, description="User prompt.")
    document_context: str | None = Field(
        default=None,
        max_length=64_000,
        description=(
            "Plain-text snapshot of the current document, injected into the "
            "system prompt so the AI can reference it."
        ),
    )
    model_id: str | None = Field(
        default=None,
        description=(
            "Optional OpenRouter model slug to use for this request. "
            "Falls back to the server default when omitted."
        ),
    )


class StreamChunk(BaseModel):
    """
    A single SSE data payload sent during a streaming response.

    type values:
      "delta"  — partial text token from the LLM
      "done"   — final sentinel; includes the full accumulated text
      "error"  — something went wrong; includes an error message
    """

    type: str = Field(..., pattern=r"^(delta|done|error)$")
    content: str = Field(default="")
    message_id: uuid.UUID | None = Field(
        default=None,
        description="Set on the 'done' event once the message is persisted.",
    )
