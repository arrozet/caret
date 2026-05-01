"""
Embedding router — HTTP boundary for document indexing and semantic search.

Route map (the router is registered in main.py with /ai prefix):
  POST   /ai/embeddings/index           — Index a document (chunk + embed + store)
  POST   /ai/embeddings/search          — Semantic search over document chunks
  DELETE /ai/embeddings/{document_id}   — Remove all embeddings for a document

Rule: NO business logic here. Validate input → call EmbeddingService → return DTO.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import AuthUser, get_current_user
from core.dependencies import get_db_session
from repositories.ai_repository import DocumentAccessRepository
from schemas.embedding import (
    IndexRequest,
    IndexResponse,
    SearchRequest,
    SearchResponse,
)
from services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/embeddings", tags=["embeddings"])


def _get_service(session: AsyncSession) -> EmbeddingService:
    """Instantiate EmbeddingService with the request-scoped session."""
    return EmbeddingService(session)


async def _authorize_document_access(
    session: AsyncSession,
    document_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """Reject document-scoped embedding operations when the caller lacks access."""

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


# ---------------------------------------------------------------------------
# POST /embeddings/index
# ---------------------------------------------------------------------------


@router.post(
    "/index",
    response_model=IndexResponse,
    status_code=status.HTTP_200_OK,
    summary="Index a document for semantic search",
    description=(
        "Splits the document content into overlapping chunks, generates "
        "vector embeddings via the OpenAI Embeddings API, and stores them "
        "in the document_embeddings table.  Safe to call on every save — "
        "existing embeddings for the document are replaced."
    ),
)
async def index_document(
    body: IndexRequest,
    user: AuthUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> IndexResponse:
    """
    Trigger embedding indexing for a document.

    Args:
        body: IndexRequest with document_id and plain-text content.
        user: Authenticated user (validated by JWT dependency).
        session: Request-scoped database session.

    Returns:
        IndexResponse with the number of chunks stored.
    """
    await _authorize_document_access(session, body.document_id, uuid.UUID(user.user_id))
    service = _get_service(session)
    try:
        chunks_indexed = await service.index_document(
            document_id=body.document_id,
            content=body.content,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return IndexResponse(
        document_id=body.document_id,
        chunks_indexed=chunks_indexed,
    )


# ---------------------------------------------------------------------------
# POST /embeddings/search
# ---------------------------------------------------------------------------


@router.post(
    "/search",
    response_model=SearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Semantic search over document chunks",
    description=(
        "Embeds the query string and returns the most similar chunks from "
        "the current document's workspace ranked by cosine similarity."
    ),
)
async def search_embeddings(
    body: SearchRequest,
    user: AuthUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> SearchResponse:
    """
    Perform a vector similarity search over the current document's workspace.

    Args:
        body: SearchRequest with query, current document_id, and top_k.
        user: Authenticated user (validated by JWT dependency).
        session: Request-scoped database session.

    Returns:
        SearchResponse containing ranked ChunkResult objects.
    """
    await _authorize_document_access(session, body.document_id, uuid.UUID(user.user_id))
    service = _get_service(session)
    results = await service.search_similar_chunks(
        query=body.query,
        document_id=body.document_id,
        user_id=uuid.UUID(user.user_id),
        top_k=body.top_k,
        exclude_current_document=body.exclude_current_document,
    )
    return SearchResponse(
        document_id=body.document_id,
        query=body.query,
        results=results,
    )


# ---------------------------------------------------------------------------
# DELETE /embeddings/{document_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete all embeddings for a document",
    description="Hard-deletes all stored embedding chunks for the specified document.",
)
async def delete_embeddings(
    document_id: uuid.UUID,
    user: AuthUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """
    Remove all vector embeddings for a document.

    Args:
        document_id: UUID of the document whose embeddings to delete.
        user: Authenticated user (validated by JWT dependency).
        session: Request-scoped database session.
    """
    await _authorize_document_access(session, document_id, uuid.UUID(user.user_id))
    service = _get_service(session)
    await service.delete_document_embeddings(document_id)
