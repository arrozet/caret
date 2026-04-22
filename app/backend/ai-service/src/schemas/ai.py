"""
Pydantic schemas (DTOs) for the AI Service API.

Schemas are the only types that cross the HTTP boundary — they are never
persisted to the database directly.  SQLAlchemy models live in models/.

Naming convention:
  <Resource>Create   — request body for POST endpoints
  <Resource>Update   — request body for PATCH endpoints
  <Resource>Response — response body (read-only, safe to serialise)
"""

import uuid
from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field

from agents.types import AgentType
from models.ai import AiMessageRole, AiSuggestionStatus

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


class ConversationListItemResponse(_TimestampedResponse):
    """Compact conversation item for sidebar/history listings."""

    id: uuid.UUID
    document_id: uuid.UUID
    title: str | None


class ConversationListByDocumentResponse(BaseModel):
    """Paginated list of conversations for one document and user."""

    model_config = ConfigDict(from_attributes=True)

    items: list[ConversationListItemResponse]
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
# ai_document_context
# ---------------------------------------------------------------------------


class DocumentContextPayload(BaseModel):
    """Structured snapshot of the current document.

    The payload is intentionally open-ended so the frontend can send editor-
    aware metadata during the transition to structured document context.
    """

    model_config = ConfigDict(extra="allow")

    content_text: str | None = Field(
        default=None,
        max_length=64_000,
        description="Plain-text snapshot of the document, when available.",
    )
    content_json: Any | None = Field(
        default=None,
        description="Structured JSON snapshot of the document, when available.",
    )


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

    id: str = Field(..., description="Model slug used when calling the target gateway.")
    name: str = Field(..., description="Human-readable display name.")
    provider: str = Field(..., description="Upstream provider name.")
    gateway: str = Field(
        ...,
        description=(
            "Which upstream API endpoint handles this model (catalog models use 'openrouter')."
        ),
    )
    is_free: bool = Field(..., description="True when the model has no API cost.")
    is_stealth: bool = Field(
        ...,
        description=(
            "True when the AI lab behind the model has not been publicly disclosed "
            "(anonymous release on OpenRouter). The real creator is unknown."
        ),
    )
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
    document_context: DocumentContextPayload | Annotated[str, Field(max_length=64_000)] | None = (
        Field(
            default=None,
            description=(
                "Structured snapshot of the current document or plain text for backward "
                "compatibility. Structured payloads are preferred and normalized by the backend."
            ),
        )
    )
    model_id: str | None = Field(
        default=None,
        description=(
            "Optional OpenRouter model slug to use for this request. "
            "Falls back to the server default when omitted."
        ),
    )
    document_id: uuid.UUID | None = Field(
        default=None,
        description=(
            "Optional document UUID. When provided, the service retrieves "
            "semantically similar chunks from the document_embeddings table "
            "and injects them into the system prompt for RAG-enhanced responses."
        ),
    )
    agent_type: AgentType | None = Field(
        default=None,
        description=(
            "Optional agent type to use for this request. "
            "When set to 'general', the agentic general agent is used instead of "
            "the plain chat agent. Translation, summary, and research are "
            "specialist agents that do not propose document edits."
        ),
    )


# ---------------------------------------------------------------------------
# Document change (agentic edits)
# ---------------------------------------------------------------------------


class DocumentChangePayload(BaseModel):
    """
    Represents a proposed document edit emitted by an agentic AI run.

    The frontend receives this payload as part of a 'document_change' SSE event
    and shows an accept/reject banner to the user. On accept, the editor
    replaces its content with `proposed_text`; on reject, nothing changes.
    """

    operation: str = Field(
        ...,
        description=(
            "The edit operation type. Currently only 'replace_full' is supported, "
            "which replaces the entire document content with `proposed_text`."
        ),
    )
    proposed_text: str = Field(
        ..., description="The full replacement document text proposed by the agent."
    )
    original_text: str = Field(
        ..., description="The document text at the time the agent was invoked (for diffing)."
    )
    position_start: int | None = Field(
        default=None,
        description="Optional start position for selection-scoped edits.",
    )
    position_end: int | None = Field(
        default=None,
        description="Optional end position for selection-scoped edits.",
    )


class StreamChunk(BaseModel):
    """
    A single SSE data payload sent during a streaming response.

    type values:
      "delta"           — partial text token from the LLM
      "done"            — final sentinel; includes the full accumulated text
      "error"           — something went wrong; includes an error message
      "document_change" — the agent proposed a document edit (agentic mode only)
      "tool_call"       — the agent invoked a tool (agentic mode only)
    """

    type: str = Field(..., pattern=r"^(delta|done|error|document_change|tool_call)$")
    content: str = Field(default="")
    message_id: uuid.UUID | None = Field(
        default=None,
        description="Set on the 'done' event once the message is persisted.",
    )
    document_change: DocumentChangePayload | None = Field(
        default=None,
        description="Populated on 'document_change' events when the agent proposes an edit.",
    )
    tool_name: str | None = Field(
        default=None,
        description="Set on 'tool_call' events — the name of the tool being invoked.",
    )
