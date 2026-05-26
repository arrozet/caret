"""
Suggestion router — HTTP boundary for AI suggestion lifecycle.

Route map (registered in main.py with /ai prefix):
  POST   /ai/suggestions                        — Create a new suggestion
  PATCH  /ai/suggestions/{id}/status            — Update suggestion lifecycle status
  GET    /ai/suggestions?conversation_id=<uuid> — List suggestions for a conversation

Rule: NO business logic here. Validate input → call Service → return DTO.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import AuthUser, get_current_user
from core.dependencies import get_db_session
from repositories.ai_repository import (
    AiSuggestionRepository,
    DocumentAccessRepository,
)
from schemas.ai import (
    SuggestionCreate,
    SuggestionResponse,
    SuggestionStatusUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


async def _authorize_document_access(
    session: AsyncSession,
    document_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    access_repo = DocumentAccessRepository(session)
    access = await access_repo.get_document_access(document_id=document_id, user_id=user_id)
    if access is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {document_id} not found.",
        )
    if not access["has_access"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this document.",
        )


@router.post(
    "",
    response_model=SuggestionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new AI suggestion",
    description="Persist a new AI-generated text suggestion in 'proposed' state.",
)
async def create_suggestion(
    body: SuggestionCreate,
    user: AuthUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> SuggestionResponse:
    await _authorize_document_access(session, body.document_id, uuid.UUID(user.user_id))

    repo = AiSuggestionRepository(session)
    suggestion = await repo.create(
        conversation_id=body.conversation_id,
        document_id=body.document_id,
        suggested_text=body.suggested_text,
        message_id=body.message_id,
        original_text=body.original_text,
        position_start=body.position_start,
        position_end=body.position_end,
    )
    return SuggestionResponse.model_validate(suggestion)


@router.patch(
    "/{suggestion_id}/status",
    response_model=SuggestionResponse,
    summary="Update suggestion lifecycle status",
    description="Transition a suggestion to applied, dismissed, or superseded.",
)
async def update_suggestion_status(
    suggestion_id: uuid.UUID,
    body: SuggestionStatusUpdate,
    user: AuthUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> SuggestionResponse:
    repo = AiSuggestionRepository(session)
    suggestion = await repo.get_by_id(suggestion_id)
    if suggestion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Suggestion {suggestion_id} not found.",
        )

    await _authorize_document_access(session, suggestion.document_id, uuid.UUID(user.user_id))

    updated = await repo.update_status(suggestion_id, body.status)
    return SuggestionResponse.model_validate(updated)


@router.get(
    "",
    response_model=list[SuggestionResponse],
    summary="List suggestions for a conversation",
    description="Return all suggestions for a conversation, optionally filtered by status.",
)
async def list_suggestions(
    conversation_id: uuid.UUID,
    status: str | None = None,
    user: AuthUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[SuggestionResponse]:
    from models.ai import AiSuggestionStatus

    repo = AiSuggestionRepository(session)
    status_filter = AiSuggestionStatus(status) if status else None
    suggestions = await repo.list_for_conversation(conversation_id, status=status_filter)
    return [SuggestionResponse.model_validate(s) for s in suggestions]
