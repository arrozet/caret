"""
AI router — HTTP boundary for all AI conversation endpoints.

Route map (relative to the /ai prefix registered in main.py):
  GET    /models                               — List available LLM models
  POST   /conversations                        — Create a new conversation
  GET    /conversations/{id}/messages          — List messages in a conversation
  DELETE /conversations/{id}                   — Delete a conversation
  POST   /conversations/{id}/stream            — SSE: stream an AI response

Rule: NO business logic here. Validate input → call Service → return DTO.
"""

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import AuthUser, get_current_user
from app.core.dependencies import get_db_session
from app.core.models_catalog import OPENROUTER_MODELS, DEFAULT_MODEL_ID, ModelEntry
from app.schemas.ai import (
    ConversationCreate,
    ConversationResponse,
    MessageListResponse,
    ModelInfo,
    ModelsResponse,
    StreamRequest,
)
from app.services.ai_agent_service import AiAgentService

logger = logging.getLogger(__name__)

# Two routers sharing the same /ai prefix but different sub-paths.
# `router` handles /ai/conversations/...
# `meta_router` handles /ai/models (no auth required — static data)
router = APIRouter(prefix="/conversations", tags=["ai"])
meta_router = APIRouter(tags=["ai"])


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _get_service(session: AsyncSession) -> AiAgentService:
    """Instantiate the AiAgentService with the request-scoped session."""
    return AiAgentService(session)


# ---------------------------------------------------------------------------
# GET /models  — list available LLM models (no auth required)
# ---------------------------------------------------------------------------


@meta_router.get(
    "/models",
    response_model=ModelsResponse,
    summary="List available LLM models",
    description=(
        "Returns the curated list of OpenRouter models that can be selected "
        "in the AI panel.  No authentication required."
    ),
)
async def list_models() -> ModelsResponse:
    """
    Return the static curated model catalog with the server default model id.

    Returns:
        ModelsResponse containing the model list and the default model id.
    """

    def _to_schema(entry: ModelEntry) -> ModelInfo:
        return ModelInfo(
            id=entry.id,
            name=entry.name,
            provider=entry.provider,
            is_free=entry.is_free,
            context_window=entry.context_window,
            description=entry.description,
        )

    return ModelsResponse(
        models=[_to_schema(m) for m in OPENROUTER_MODELS],
        default_model_id=DEFAULT_MODEL_ID,
    )


# ---------------------------------------------------------------------------
# POST /conversations  — start a new conversation
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new AI conversation",
    description=(
        "Opens a fresh conversation tied to a specific document. "
        "The conversation is scoped to the authenticated user."
    ),
)
async def create_conversation(
    body: ConversationCreate,
    user: AuthUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ConversationResponse:
    """
    Create and persist a new AI conversation for the given document.

    Args:
        body: Validated request body containing document_id and optional title.
        user: Authenticated user injected by the JWT dependency.
        session: Request-scoped database session.

    Returns:
        The newly created ConversationResponse.
    """
    service = _get_service(session)
    return await service.create_conversation(
        document_id=body.document_id,
        user_id=uuid.UUID(user.user_id),
        title=body.title,
    )


# ---------------------------------------------------------------------------
# GET /conversations/{conversation_id}/messages  — list messages
# ---------------------------------------------------------------------------


@router.get(
    "/{conversation_id}/messages",
    response_model=MessageListResponse,
    summary="List messages in a conversation",
    description="Returns all messages ordered by creation time (ascending).",
)
async def list_messages(
    conversation_id: uuid.UUID,
    user: AuthUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> MessageListResponse:
    """
    Return all messages belonging to the specified conversation.

    The conversation must exist; ownership is not re-validated here because
    the conversation was created by the same user (enforced at creation time).
    A production hardening pass should add an explicit ownership check.

    Args:
        conversation_id: UUID of the target conversation.
        user: Authenticated user (validated by JWT dependency).
        session: Request-scoped database session.

    Returns:
        MessageListResponse with the ordered message list.

    Raises:
        HTTPException 404 if the conversation does not exist.
    """
    from app.repositories.ai_repository import AiConversationRepository

    conv_repo = AiConversationRepository(session)
    conversation = await conv_repo.get_by_id(conversation_id)
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )

    service = _get_service(session)
    return await service.list_messages(conversation_id)


# ---------------------------------------------------------------------------
# DELETE /conversations/{conversation_id}  — delete conversation
# ---------------------------------------------------------------------------


@router.delete(
    "/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a conversation",
    description="Hard-deletes the conversation and all its messages and suggestions.",
)
async def delete_conversation(
    conversation_id: uuid.UUID,
    user: AuthUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """
    Delete a conversation by ID.  Cascades to ai_messages and ai_suggestions.

    Args:
        conversation_id: UUID of the conversation to delete.
        user: Authenticated user (validated by JWT dependency).
        session: Request-scoped database session.

    Raises:
        HTTPException 404 if the conversation does not exist.
    """
    from app.repositories.ai_repository import AiConversationRepository

    conv_repo = AiConversationRepository(session)
    deleted = await conv_repo.delete(conversation_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )


# ---------------------------------------------------------------------------
# POST /conversations/{conversation_id}/stream  — SSE streaming
# ---------------------------------------------------------------------------


@router.post(
    "/{conversation_id}/stream",
    summary="Stream an AI response (SSE)",
    description=(
        "Persists the user message, runs the PydanticAI agent, and streams "
        "the assistant reply as Server-Sent Events (text/event-stream).\n\n"
        "Each event has the shape: ``data: {\\\"type\\\": \\\"delta\\\"|\\\"done\\\"|\\\"error\\\", \\\"content\\\": \\\"...\\\"}``"
    ),
    response_class=StreamingResponse,
)
async def stream_ai_response(
    conversation_id: uuid.UUID,
    body: StreamRequest,
    user: AuthUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> StreamingResponse:
    """
    Stream the AI response for a user message via Server-Sent Events.

    The endpoint:
      1. Validates the conversation exists.
      2. Persists the user message.
      3. Runs the PydanticAI agent with the full conversation history.
      4. Yields SSE chunks to the client as they arrive.
      5. Persists the completed assistant message on the 'done' event.

    The frontend consumes the stream and applies each delta as a Tiptap
    Transaction so that Y.js stays in sync with all collaborators.

    Args:
        conversation_id: UUID of the target conversation.
        body: StreamRequest containing the user message and optional document context.
        user: Authenticated user (validated by JWT dependency).
        session: Request-scoped database session.

    Returns:
        StreamingResponse with media_type text/event-stream.

    Raises:
        HTTPException 404 if the conversation does not exist.
    """
    from app.repositories.ai_repository import AiConversationRepository

    conv_repo = AiConversationRepository(session)
    conversation = await conv_repo.get_by_id(conversation_id)
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )

    service = _get_service(session)

    return StreamingResponse(
        content=service.stream_response(
            conversation_id=conversation_id,
            user_message=body.message,
            document_context=body.document_context,
            model_id=body.model_id,
        ),
        media_type="text/event-stream",
        headers={
            # Disable buffering so chunks reach the client immediately
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
