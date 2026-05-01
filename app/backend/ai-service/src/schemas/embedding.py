"""
Pydantic schemas (DTOs) for the Embedding API.

These schemas cross the HTTP boundary for the document indexing and
semantic search endpoints.  They are never persisted to the database directly.
"""

import uuid

from pydantic import BaseModel, Field


class IndexRequest(BaseModel):
    """Request body for POST /embeddings/index — triggers chunk indexing for a document."""

    document_id: uuid.UUID = Field(..., description="UUID of the document to index.")
    content: str = Field(
        ...,
        min_length=1,
        max_length=500_000,
        description="Plain-text content of the document to chunk and embed.",
    )


class IndexResponse(BaseModel):
    """Response body for POST /embeddings/index."""

    document_id: uuid.UUID
    chunks_indexed: int = Field(..., description="Number of chunks stored.")


class SearchRequest(BaseModel):
    """Request body for POST /embeddings/search."""

    query: str = Field(..., min_length=1, max_length=2_000, description="Query text.")
    document_id: uuid.UUID = Field(
        ...,
        description="Current document UUID used to resolve the workspace search scope.",
    )
    top_k: int = Field(default=5, ge=1, le=20, description="Maximum number of chunks to return.")
    exclude_current_document: bool = Field(
        default=False,
        description="Exclude chunks from the current document while keeping the workspace scope.",
    )


class ChunkResult(BaseModel):
    """A single retrieved chunk with its similarity score."""

    document_id: uuid.UUID
    workspace_id: uuid.UUID
    chunk_index: int
    chunk_text: str
    document_title: str | None = None
    is_current_document: bool
    score: float = Field(..., description="Cosine similarity score (0-1, higher = closer).")


class SearchResponse(BaseModel):
    """Response body for POST /embeddings/search."""

    document_id: uuid.UUID
    query: str
    results: list[ChunkResult]
