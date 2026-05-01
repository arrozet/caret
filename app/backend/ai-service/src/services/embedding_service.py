"""
EmbeddingService — orchestrates document chunking, embedding generation,
and vector storage for the Phase 4 RAG pipeline.

Architecture:
  - This service is the ONLY layer that calls the OpenAI Embeddings API.
  - Chunking uses a fixed-size sliding-window algorithm with overlap.
  - Embeddings are stored via DocumentEmbeddingRepository.
  - RAG retrieval queries the repository for cosine-similar chunks.
"""

import logging
import uuid

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from repositories.ai_repository import DocumentEmbeddingRepository
from schemas.embedding import ChunkResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Chunking constants
# ---------------------------------------------------------------------------

_CHUNK_SIZE = 512  # characters per chunk
_CHUNK_OVERLAP = 64  # overlap between consecutive chunks


# ---------------------------------------------------------------------------
# EmbeddingService
# ---------------------------------------------------------------------------


class EmbeddingService:
    """
    Provides document indexing (chunk → embed → store) and semantic search
    (embed query → vector similarity search) for the RAG pipeline.

    Each method receives an AsyncSession so the service participates in the
    same request-scoped transaction managed by the FastAPI dependency.
    """

    def __init__(self, session: AsyncSession) -> None:
        """
        Initialize the service with a request-scoped database session.

        Args:
            session: SQLAlchemy async session for all DB operations.
        """
        self._session = session
        self._repo = DocumentEmbeddingRepository(session)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def index_document(self, document_id: uuid.UUID, content: str) -> int:
        """
        Split `content` into overlapping chunks, embed each chunk, and
        store them in the document_embeddings table.

        Existing embeddings for `document_id` are deleted first, making
        this operation fully idempotent (safe to call on every save).

        Args:
            document_id: UUID of the document being indexed.
            content: Plain-text content of the document.

        Returns:
            The number of chunks stored.

        Raises:
            RuntimeError: If no embedding API key is configured.
            httpx.HTTPStatusError: If the OpenAI Embeddings API returns an error.
        """
        chunks = _split_into_chunks(content)
        if not chunks:
            return 0

        metadata = await self._repo.get_document_metadata(document_id)
        if metadata is None:
            raise ValueError(f"Document {document_id} was not found.")

        await self._lock_document_indexing(document_id)

        texts = [text for _, text in chunks]
        vectors = await self._embed_texts(texts)

        chunk_rows = [(idx, text, vector) for (idx, text), vector in zip(chunks, vectors)]
        return await self._repo.bulk_insert(
            document_id,
            metadata["workspace_id"],
            chunk_rows,
        )

    async def search_similar_chunks(
        self,
        query: str,
        document_id: uuid.UUID,
        user_id: uuid.UUID,
        top_k: int = 5,
        exclude_current_document: bool = False,
    ) -> list[ChunkResult]:
        """
        Embed `query` and return the most similar chunks in the document's workspace.

        Args:
            query: The user query or message text.
            document_id: Current document UUID used to resolve workspace scope.
            user_id: Authenticated user UUID used to filter source-document visibility.
            top_k: Maximum number of chunks to return.
            exclude_current_document: Exclude chunks from the current document.

        Returns:
            Ordered list of ChunkResult objects (closest first).

        Raises:
            RuntimeError: If no embedding API key is configured.
        """
        query_vectors = await self._embed_texts([query])
        query_vector = query_vectors[0]

        hits = await self._repo.search_workspace(
            query_embedding=query_vector,
            document_id=document_id,
            user_id=user_id,
            top_k=top_k,
            exclude_current_document=exclude_current_document,
        )
        return [
            ChunkResult(
                document_id=chunk["document_id"],
                workspace_id=chunk["workspace_id"],
                chunk_index=chunk["chunk_index"],
                chunk_text=chunk["chunk_text"],
                document_title=chunk["document_title"],
                is_current_document=chunk["is_current_document"],
                score=max(0.0, 1.0 - float(chunk["distance"])),  # cosine dist → similarity
            )
            for chunk in hits
        ]

    async def delete_document_embeddings(self, document_id: uuid.UUID) -> int:
        """
        Remove all stored chunks for a document.

        Args:
            document_id: Target document UUID.

        Returns:
            Number of rows deleted.
        """
        return await self._repo.delete_for_document(document_id)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _embed_texts(self, texts: list[str]) -> list[list[float]]:
        """
        Call the OpenAI Embeddings API and return a list of embedding vectors.

        Attempts to use OPENAI_API_KEY first, then OPENROUTER_API_KEY as
        fallback (OpenRouter supports the /v1/embeddings endpoint for
        compatible models).

        Args:
            texts: List of non-empty strings to embed.

        Returns:
            List of float32 embedding vectors (one per input text).

        Raises:
            RuntimeError: If no suitable API key is configured.
            httpx.HTTPStatusError: On non-2xx responses from the API.
        """
        if settings.openai_api_key:
            base_url = "https://api.openai.com/v1"
            api_key = settings.openai_api_key
            model = settings.openai_embedding_model
        elif settings.openrouter_api_key:
            base_url = "https://openrouter.ai/api/v1"
            api_key = settings.openrouter_api_key
            model = "openai/text-embedding-3-small"
        else:
            raise RuntimeError(
                "No embedding API key configured. "
                "Set OPENAI_API_KEY or OPENROUTER_API_KEY in the environment."
            )

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{base_url}/embeddings",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": model, "input": texts},
            )
            response.raise_for_status()
            data = response.json()

        # OpenAI returns {"data": [{"index": i, "embedding": [...]}]}
        sorted_items = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in sorted_items]

    async def _lock_document_indexing(self, document_id: uuid.UUID) -> None:
        """Serialize embedding refreshes for the same document inside one transaction."""
        lock_key = document_id.int % 2_147_483_647
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(:lock_key)"),
            {"lock_key": lock_key},
        )


# ---------------------------------------------------------------------------
# Chunking utility (module-level pure function)
# ---------------------------------------------------------------------------


def _split_into_chunks(
    text: str,
    chunk_size: int = _CHUNK_SIZE,
    overlap: int = _CHUNK_OVERLAP,
) -> list[tuple[int, str]]:
    """
    Split text into overlapping fixed-size character chunks.

    Uses a sliding-window approach: each chunk is `chunk_size` characters
    long, and consecutive chunks share `overlap` characters.  Empty or
    whitespace-only chunks are discarded.

    Args:
        text: Raw document text to chunk.
        chunk_size: Maximum length (in characters) of each chunk.
        overlap: Number of characters shared between adjacent chunks.

    Returns:
        List of (chunk_index, chunk_text) tuples, zero-indexed.
    """
    if not text.strip():
        return []

    step = max(1, chunk_size - overlap)
    chunks: list[tuple[int, str]] = []
    index = 0
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append((index, chunk_text))
            index += 1
        start += step

    return chunks
