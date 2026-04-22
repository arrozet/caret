"""
AI router — HTTP boundary for all AI conversation endpoints.

Route map (relative to the /ai prefix registered in main.py):
  GET    /models                               — List available LLM models
  GET    /conversations?document_id=<uuid>     — List conversation history
  POST   /conversations                        — Create a new conversation
  GET    /conversations/{id}/messages          — List messages in a conversation
  DELETE /conversations/{id}                   — Delete a conversation
  POST   /conversations/{id}/stream            — SSE: stream an AI response

Rule: NO business logic here. Validate input → call Service → return DTO.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from agents.registry import AGENT_REGISTRY
from core.auth import AuthUser, get_current_user
from core.config import settings
from core.dependencies import get_db_session
from core.models_catalog import OPENROUTER_MODELS, ModelEntry
from schemas.ai import (
    ConversationCreate,
    ConversationListByDocumentResponse,
    ConversationResponse,
    MessageListResponse,
    ModelInfo,
    ModelsResponse,
    StreamRequest,
)
from services.ai_agent_service import AiAgentService

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
            gateway=entry.gateway,
            is_free=entry.is_free,
            is_stealth=entry.is_stealth,
            context_window=entry.context_window,
            description=entry.description,
        )

    return ModelsResponse(
        models=[_to_schema(m) for m in OPENROUTER_MODELS],
        default_model_id=settings.openrouter_model,
    )


@meta_router.get(
    "/agents",
    summary="List available AI agents",
    description="Returns the curated set of predefined agent slugs exposed in the editor UI.",
)
async def list_agents() -> list[dict[str, str]]:
    """Return the predefined agent registry for the frontend selector."""
    return [
        {"slug": entry.slug, "description": entry.description} for entry in AGENT_REGISTRY.values()
    ]


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


@router.get(
    "",
    response_model=ConversationListByDocumentResponse,
    summary="List conversations for a document",
    description=(
        "Returns persisted conversations for the authenticated user filtered "
        "by document_id, ordered by most recently updated."
    ),
)
async def list_conversations(
    document_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    user: AuthUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> ConversationListByDocumentResponse:
    """
    List conversation history for one document owned by the authenticated user.

    Args:
        document_id: Document UUID used to scope the list.
        limit: Maximum rows to return.
        offset: Number of rows to skip.
        user: Authenticated user injected by JWT dependency.
        session: Request-scoped database session.

    Returns:
        Paginated conversation list ordered by updated_at descending.
    """
    service = _get_service(session)
    return await service.list_conversations_for_document(
        document_id=document_id,
        user_id=uuid.UUID(user.user_id),
        limit=limit,
        offset=offset,
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
    from repositories.ai_repository import AiConversationRepository

    conv_repo = AiConversationRepository(session)
    conversation = await conv_repo.get_by_id_for_user(
        conversation_id=conversation_id,
        user_id=uuid.UUID(user.user_id),
    )
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
    from repositories.ai_repository import AiConversationRepository

    conv_repo = AiConversationRepository(session)
    conversation = await conv_repo.get_by_id_for_user(
        conversation_id=conversation_id,
        user_id=uuid.UUID(user.user_id),
    )
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )

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
        "Each event has the shape: "
        '``data: {\\"type\\": \\"delta\\"|\\"done\\"|'
        '\\"error\\", \\"content\\": \\"...\\"}``'
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
    from repositories.ai_repository import AiConversationRepository

    conv_repo = AiConversationRepository(session)
    conversation = await conv_repo.get_by_id_for_user(
        conversation_id=conversation_id,
        user_id=uuid.UUID(user.user_id),
    )
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
            document_id=body.document_id,  # Pass optional document_id for RAG retrieval
            agent_type=body.agent_type,  # Pass optional agent_type for agentic mode
        ),
        media_type="text/event-stream",
        headers={
            # Disable buffering so chunks reach the client immediately
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
