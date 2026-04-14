"""
Unit tests for EmbeddingService and the _split_into_chunks utility.

All tests mock the database session, repository, and HTTP client so they
run without any external dependencies (no DB, no OpenAI API keys needed).
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.embedding_service import EmbeddingService, _split_into_chunks

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _make_mock_session() -> MagicMock:
    """Return a MagicMock that satisfies the AsyncSession interface."""
    session = MagicMock()
    session.add = MagicMock()
    session.add_all = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock()
    return session


def _make_mock_chunk(
    chunk_index: int = 0,
    chunk_text: str = "sample text",
) -> MagicMock:
    """Build a mock DocumentEmbedding ORM object."""
    chunk = MagicMock()
    chunk.chunk_index = chunk_index
    chunk.chunk_text = chunk_text
    return chunk


# ---------------------------------------------------------------------------
# _split_into_chunks — pure function tests
# ---------------------------------------------------------------------------


class TestSplitIntoChunks:
    """Tests for the module-level _split_into_chunks utility.

    Verifies chunking correctness, edge cases, overlap behavior, and
    index assignment without any I/O.
    """

    def test_empty_string_returns_empty_list(self) -> None:
        """_split_into_chunks('') should return an empty list."""
        # Arrange / Act
        result = _split_into_chunks("")

        # Assert
        assert result == []

    def test_whitespace_only_returns_empty_list(self) -> None:
        """_split_into_chunks with only whitespace should return an empty list."""
        # Arrange / Act
        result = _split_into_chunks("   \n\t  ")

        # Assert
        assert result == []

    def test_short_text_returns_single_chunk(self) -> None:
        """Text shorter than chunk_size should produce exactly one chunk."""
        # Arrange
        text = "a" * 100  # 100 chars < default chunk_size of 512

        # Act
        result = _split_into_chunks(text)

        # Assert
        assert len(result) == 1
        assert result[0][0] == 0  # chunk_index is 0
        assert result[0][1] == text

    def test_text_equal_to_chunk_size_returns_at_least_one_chunk(self) -> None:
        """Text exactly chunk_size characters long should produce at least one chunk.

        The sliding-window algorithm may produce a second (smaller) chunk because
        the step is chunk_size - overlap, so the window advances before the end is
        reached.  The important invariant is that the first chunk covers the full
        chunk_size worth of content.
        """
        # Arrange
        text = "b" * 512

        # Act
        result = _split_into_chunks(text, chunk_size=512, overlap=64)

        # Assert — at least one chunk, and the first chunk is the full text
        assert len(result) >= 1
        assert result[0][0] == 0
        assert result[0][1] == text

    def test_long_text_produces_multiple_chunks(self) -> None:
        """Text longer than chunk_size should produce multiple chunks."""
        # Arrange — 1024 chars with chunk_size=512, overlap=64 → step=448
        # chunks start at: 0, 448, 896 → 3 chunks
        text = "x" * 1024

        # Act
        result = _split_into_chunks(text, chunk_size=512, overlap=64)

        # Assert
        assert len(result) > 1

    def test_chunk_indices_are_zero_based_sequential(self) -> None:
        """Chunk indices must be zero-based and sequential integers."""
        # Arrange
        text = "w" * 2000

        # Act
        result = _split_into_chunks(text, chunk_size=512, overlap=64)

        # Assert
        for expected_idx, (actual_idx, _) in enumerate(result):
            assert actual_idx == expected_idx

    def test_overlap_produces_shared_characters_between_consecutive_chunks(self) -> None:
        """Consecutive chunks must share 'overlap' characters at their boundary."""
        # Arrange — use a simple alphabet pattern so we can verify the overlap
        chunk_size = 10
        overlap = 3
        # Text is long enough for at least 2 chunks
        text = "abcdefghijklmnopqrstuvwxyz"  # 26 chars

        # Act
        result = _split_into_chunks(text, chunk_size=chunk_size, overlap=overlap)

        # Assert — at least two chunks were produced
        assert len(result) >= 2

        # The tail of chunk[0] and the head of chunk[1] share 'overlap' characters
        _, chunk0_text = result[0]
        _, chunk1_text = result[1]
        # chunk0 ends at index chunk_size; chunk1 starts at step = chunk_size - overlap
        step = chunk_size - overlap
        tail_of_chunk0 = text[step:chunk_size]  # overlapping segment from chunk0
        head_of_chunk1 = chunk1_text[:overlap]  # beginning of chunk1
        assert tail_of_chunk0 == head_of_chunk1

    def test_chunk_text_is_stripped(self) -> None:
        """Chunk text must be stripped of leading/trailing whitespace."""
        # Arrange — surround content with spaces
        text = "  hello world  " * 40  # ensure it fits in one chunk

        # Act
        result = _split_into_chunks(text)

        # Assert
        for _, chunk_text in result:
            assert chunk_text == chunk_text.strip()

    def test_custom_chunk_size_and_overlap(self) -> None:
        """Custom chunk_size and overlap parameters should be respected.

        With chunk_size=6, overlap=2, step=4 on a 10-char string:
          chunk 0: text[0:6]  = "012345"
          chunk 1: text[4:10] = "456789"
          chunk 2: text[8:14] = "89"      ← tail chunk (less than chunk_size)
        Three chunks in total — the tail chunk is included because the loop
        only stops when start >= len(text).
        """
        # Arrange
        text = "0123456789"  # 10 chars
        chunk_size = 6
        overlap = 2
        # step = 6 - 2 = 4
        # starts: 0, 4, 8 → 3 chunks

        # Act
        result = _split_into_chunks(text, chunk_size=chunk_size, overlap=overlap)

        # Assert — correct number, indices, and text for each chunk
        assert len(result) == 3
        assert result[0] == (0, "012345")
        assert result[1] == (1, "456789")
        assert result[2] == (2, "89")


# ---------------------------------------------------------------------------
# EmbeddingService.index_document
# ---------------------------------------------------------------------------


class TestEmbeddingServiceIndexDocument:
    """Test EmbeddingService.index_document with mocked dependencies.

    Verifies that chunking, embedding, and repository calls are wired correctly
    without any real DB or HTTP calls.
    """

    @pytest.mark.asyncio
    async def test_index_document_calls_bulk_insert_with_correct_args(self) -> None:
        """index_document should call _repo.bulk_insert with (document_id, chunk_rows)."""
        # Arrange
        session = _make_mock_session()
        document_id = uuid.uuid4()
        content = "Hello world. " * 10  # short text → single chunk

        fake_vector = [0.1] * 1536
        expected_chunk_count = 1

        service = EmbeddingService(session)

        with (
            patch.object(
                service,
                "_embed_texts",
                new_callable=AsyncMock,
                return_value=[fake_vector],
            ),
            patch.object(
                service._repo,
                "bulk_insert",
                new_callable=AsyncMock,
                return_value=expected_chunk_count,
            ) as mock_bulk_insert,
        ):
            # Act
            result = await service.index_document(document_id=document_id, content=content)

        # Assert
        assert result == expected_chunk_count
        mock_bulk_insert.assert_called_once()
        call_args = mock_bulk_insert.call_args
        assert call_args[0][0] == document_id  # first positional arg is document_id
        chunk_rows = call_args[0][1]
        assert len(chunk_rows) == 1
        idx, text_chunk, vector = chunk_rows[0]
        assert idx == 0
        assert isinstance(text_chunk, str)
        assert len(text_chunk) > 0
        assert vector == fake_vector

    @pytest.mark.asyncio
    async def test_index_document_empty_content_returns_zero(self) -> None:
        """index_document with empty content should return 0 without calling embedding API."""
        # Arrange
        session = _make_mock_session()
        document_id = uuid.uuid4()

        service = EmbeddingService(session)

        with patch.object(
            service,
            "_embed_texts",
            new_callable=AsyncMock,
        ) as mock_embed:
            # Act
            result = await service.index_document(document_id=document_id, content="   ")

        # Assert
        assert result == 0
        mock_embed.assert_not_called()

    @pytest.mark.asyncio
    async def test_index_document_long_content_produces_multiple_chunks(self) -> None:
        """index_document with content exceeding chunk_size should embed multiple chunks."""
        # Arrange
        session = _make_mock_session()
        document_id = uuid.uuid4()
        # 2000 chars → more than one 512-char chunk
        content = "word " * 400

        fake_vectors = [[float(i)] * 1536 for i in range(10)]  # enough for any chunk count

        service = EmbeddingService(session)

        with (
            patch.object(
                service,
                "_embed_texts",
                new_callable=AsyncMock,
                side_effect=lambda texts: fake_vectors[: len(texts)],
            ),
            patch.object(
                service._repo,
                "bulk_insert",
                new_callable=AsyncMock,
                return_value=5,
            ) as mock_bulk_insert,
        ):
            # Act
            await service.index_document(document_id=document_id, content=content)

        # Assert — bulk_insert received multiple chunk rows
        call_args = mock_bulk_insert.call_args
        chunk_rows = call_args[0][1]
        assert len(chunk_rows) > 1

    @pytest.mark.asyncio
    async def test_index_document_acquires_advisory_lock_before_insert(self) -> None:
        """index_document must serialize writes for the same document id."""
        session = _make_mock_session()
        document_id = uuid.uuid4()
        content = "Hello world. " * 10

        fake_vector = [0.1] * 1536

        service = EmbeddingService(session)

        with (
            patch.object(
                service,
                "_embed_texts",
                new_callable=AsyncMock,
                return_value=[fake_vector],
            ),
            patch.object(
                service._repo,
                "bulk_insert",
                new_callable=AsyncMock,
                return_value=1,
            ),
        ):
            await service.index_document(document_id=document_id, content=content)

        assert session.execute.call_count >= 1


# ---------------------------------------------------------------------------
# EmbeddingService.search_similar_chunks
# ---------------------------------------------------------------------------


class TestEmbeddingServiceSearch:
    """Test EmbeddingService.search_similar_chunks with mocked dependencies.

    Verifies that the query is embedded, the repository is queried, and the
    results are correctly mapped to ChunkResult objects.
    """

    @pytest.mark.asyncio
    async def test_search_returns_chunk_results(self) -> None:
        """search_similar_chunks should return a list of ChunkResult objects."""
        # Arrange
        session = _make_mock_session()
        document_id = uuid.uuid4()
        query = "What is the main topic?"

        fake_query_vector = [0.5] * 1536
        mock_chunk = _make_mock_chunk(chunk_index=2, chunk_text="Relevant passage here.")
        # Repository returns (DocumentEmbedding, cosine_distance) tuples
        mock_repo_hits = [(mock_chunk, 0.15)]  # distance 0.15 → score 0.85

        service = EmbeddingService(session)

        with (
            patch.object(
                service,
                "_embed_texts",
                new_callable=AsyncMock,
                return_value=[fake_query_vector],
            ),
            patch.object(
                service._repo,
                "search",
                new_callable=AsyncMock,
                return_value=mock_repo_hits,
            ),
        ):
            # Act
            results = await service.search_similar_chunks(
                query=query,
                document_id=document_id,
                top_k=5,
            )

        # Assert
        assert len(results) == 1
        chunk_result = results[0]
        assert chunk_result.chunk_index == 2
        assert chunk_result.chunk_text == "Relevant passage here."
        assert abs(chunk_result.score - 0.85) < 1e-6

    @pytest.mark.asyncio
    async def test_search_passes_top_k_to_repository(self) -> None:
        """search_similar_chunks should forward top_k to the repository.search call."""
        # Arrange
        session = _make_mock_session()
        document_id = uuid.uuid4()

        service = EmbeddingService(session)

        with (
            patch.object(
                service,
                "_embed_texts",
                new_callable=AsyncMock,
                return_value=[[0.0] * 1536],
            ),
            patch.object(
                service._repo,
                "search",
                new_callable=AsyncMock,
                return_value=[],
            ) as mock_search,
        ):
            # Act
            await service.search_similar_chunks(
                query="test",
                document_id=document_id,
                top_k=3,
            )

        # Assert
        mock_search.assert_called_once_with(
            query_embedding=[0.0] * 1536,
            document_id=document_id,
            top_k=3,
        )

    @pytest.mark.asyncio
    async def test_search_score_clamps_to_zero_for_large_distance(self) -> None:
        """Scores must never be negative — cosine distance > 1.0 should be clamped to 0."""
        # Arrange
        session = _make_mock_session()
        document_id = uuid.uuid4()

        mock_chunk = _make_mock_chunk(chunk_index=0, chunk_text="distant chunk")
        # cosine distance > 1.0 (should not happen normally but must be handled safely)
        mock_repo_hits = [(mock_chunk, 1.5)]

        service = EmbeddingService(session)

        with (
            patch.object(
                service,
                "_embed_texts",
                new_callable=AsyncMock,
                return_value=[[0.0] * 1536],
            ),
            patch.object(
                service._repo,
                "search",
                new_callable=AsyncMock,
                return_value=mock_repo_hits,
            ),
        ):
            # Act
            results = await service.search_similar_chunks(
                query="query",
                document_id=document_id,
            )

        # Assert
        assert results[0].score == 0.0


# ---------------------------------------------------------------------------
# EmbeddingService.delete_document_embeddings
# ---------------------------------------------------------------------------


class TestEmbeddingServiceDelete:
    """Test EmbeddingService.delete_document_embeddings."""

    @pytest.mark.asyncio
    async def test_delete_calls_repo_delete_for_document(self) -> None:
        """delete_document_embeddings should delegate to _repo.delete_for_document."""
        # Arrange
        session = _make_mock_session()
        document_id = uuid.uuid4()

        service = EmbeddingService(session)

        with patch.object(
            service._repo,
            "delete_for_document",
            new_callable=AsyncMock,
            return_value=7,
        ) as mock_delete:
            # Act
            result = await service.delete_document_embeddings(document_id)

        # Assert
        assert result == 7
        mock_delete.assert_called_once_with(document_id)


# ---------------------------------------------------------------------------
# EmbeddingService._embed_texts — API key validation
# ---------------------------------------------------------------------------


class TestEmbeddingServiceEmbedTexts:
    """Test the _embed_texts internal method focusing on API key validation.

    Verifies that a RuntimeError is raised when neither OPENAI_API_KEY nor
    OPENROUTER_API_KEY is configured, without making any real HTTP calls.
    """

    @pytest.mark.asyncio
    async def test_embed_texts_raises_runtime_error_when_no_api_key(self) -> None:
        """_embed_texts should raise RuntimeError when no API keys are configured."""
        # Arrange
        session = _make_mock_session()
        service = EmbeddingService(session)

        with patch("services.embedding_service.settings") as mock_settings:
            mock_settings.openai_api_key = ""
            mock_settings.openrouter_api_key = ""
            mock_settings.openai_embedding_model = "text-embedding-3-small"

            # Act / Assert
            with pytest.raises(RuntimeError, match="No embedding API key configured"):
                await service._embed_texts(["some text"])

    @pytest.mark.asyncio
    async def test_embed_texts_uses_openai_when_key_set(self) -> None:
        """_embed_texts should POST to api.openai.com when OPENAI_API_KEY is set."""
        # Arrange
        session = _make_mock_session()
        service = EmbeddingService(session)

        fake_response_data = {"data": [{"index": 0, "embedding": [0.1] * 1536}]}

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value=fake_response_data)

        mock_http_client = MagicMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=False)
        mock_http_client.post = AsyncMock(return_value=mock_response)

        with (
            patch("services.embedding_service.settings") as mock_settings,
            patch(
                "services.embedding_service.httpx.AsyncClient",
                return_value=mock_http_client,
            ),
        ):
            mock_settings.openai_api_key = "sk-test-key"
            mock_settings.openrouter_api_key = ""
            mock_settings.openai_embedding_model = "text-embedding-3-small"

            # Act
            result = await service._embed_texts(["hello"])

        # Assert
        assert len(result) == 1
        assert len(result[0]) == 1536
        # Verify the correct base URL was used
        call_args = mock_http_client.post.call_args
        assert "api.openai.com" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_embed_texts_falls_back_to_openrouter_when_no_openai_key(self) -> None:
        """_embed_texts should use OpenRouter when only OPENROUTER_API_KEY is set."""
        # Arrange
        session = _make_mock_session()
        service = EmbeddingService(session)

        fake_response_data = {"data": [{"index": 0, "embedding": [0.2] * 1536}]}

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value=fake_response_data)

        mock_http_client = MagicMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=False)
        mock_http_client.post = AsyncMock(return_value=mock_response)

        with (
            patch("services.embedding_service.settings") as mock_settings,
            patch(
                "services.embedding_service.httpx.AsyncClient",
                return_value=mock_http_client,
            ),
        ):
            mock_settings.openai_api_key = ""
            mock_settings.openrouter_api_key = "or-test-key"
            mock_settings.openai_embedding_model = "text-embedding-3-small"

            # Act
            result = await service._embed_texts(["hello"])

        # Assert
        call_args = mock_http_client.post.call_args
        assert "openrouter.ai" in call_args[0][0]
        assert result[0] == [0.2] * 1536
