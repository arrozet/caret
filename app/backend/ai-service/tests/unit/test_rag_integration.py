"""
Unit tests for RAG (Retrieval-Augmented Generation) integration.

Verifies:
- StreamRequest accepts an optional document_id field.
- AiAgentService._retrieve_rag_context behaviour across all scenarios.
- stream_response correctly wires _retrieve_rag_context when document_id is given.

All tests are fully isolated: no real DB, HTTP, or LLM calls are made.
The EmbeddingService is mocked at the module boundary to avoid requiring the
actual embedding_service.py to exist (it is written by a parallel agent).
"""

import json
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.ai import AiMessageRole
from app.schemas.ai import StreamRequest
from app.schemas.embedding import ChunkResult
from app.services.ai_agent_service import AiAgentService

# ---------------------------------------------------------------------------
# Shared helpers (mirrors test_ai_agent_service.py helpers for consistency)
# ---------------------------------------------------------------------------


def _make_mock_session() -> MagicMock:
    """Return a MagicMock that satisfies the AsyncSession interface."""
    session = MagicMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock()
    return session


def _make_mock_message(
    conversation_id: uuid.UUID | None = None,
    role: AiMessageRole = AiMessageRole.user,
    content: str = "Hello",
) -> MagicMock:
    """Build a mock AiMessage model object."""
    msg = MagicMock()
    msg.id = uuid.uuid4()
    msg.conversation_id = conversation_id or uuid.uuid4()
    msg.role = role
    msg.content = content
    msg.token_count = None
    msg.created_at = datetime.now(UTC)
    msg.updated_at = datetime.now(UTC)
    return msg


def _make_chunk_result(index: int = 0, text: str = "Some text", score: float = 0.9) -> ChunkResult:
    """Build a ChunkResult DTO for use in RAG mocking."""
    return ChunkResult(chunk_index=index, chunk_text=text, score=score)


# ---------------------------------------------------------------------------
# StreamRequest schema — document_id field
# ---------------------------------------------------------------------------


class TestStreamRequestDocumentId:
    """Verify that StreamRequest correctly handles the optional document_id field."""

    def test_stream_request_accepts_document_id(self) -> None:
        """StreamRequest should accept a valid UUID for document_id."""
        doc_id = uuid.uuid4()
        req = StreamRequest(message="Hello", document_id=doc_id)
        assert req.document_id == doc_id

    def test_stream_request_document_id_defaults_to_none(self) -> None:
        """StreamRequest should default document_id to None when omitted."""
        req = StreamRequest(message="Hello")
        assert req.document_id is None

    def test_stream_request_document_id_accepts_string_uuid(self) -> None:
        """StreamRequest should coerce a string UUID to uuid.UUID."""
        doc_id = uuid.uuid4()
        req = StreamRequest(message="Hello", document_id=str(doc_id))
        assert req.document_id == doc_id

    def test_stream_request_full_payload_validates(self) -> None:
        """StreamRequest with all optional fields populated should validate without error."""
        doc_id = uuid.uuid4()
        req = StreamRequest(
            message="Summarise this.",
            document_context="Some document text.",
            model_id="qwen/qwen3-coder:free",
            document_id=doc_id,
        )
        assert req.document_id == doc_id
        assert req.model_id == "qwen/qwen3-coder:free"
        assert req.document_context == "Some document text."

    def test_stream_request_without_document_id_still_valid(self) -> None:
        """StreamRequest without document_id must still pass validation (backward compat)."""
        req = StreamRequest(message="Tell me a joke.")
        assert req.document_id is None
        assert req.message == "Tell me a joke."


# ---------------------------------------------------------------------------
# AiAgentService._retrieve_rag_context
# ---------------------------------------------------------------------------


class TestRetrieveRagContext:
    """Test the _retrieve_rag_context private helper in isolation."""

    @pytest.mark.asyncio
    async def test_returns_empty_string_when_no_chunks(self) -> None:
        """_retrieve_rag_context should return '' when search returns an empty list."""
        session = _make_mock_session()
        service = AiAgentService(session)
        doc_id = uuid.uuid4()

        mock_emb_service = MagicMock()
        mock_emb_service.search_similar_chunks = AsyncMock(return_value=[])

        with patch(
            "app.services.ai_agent_service.AiAgentService._retrieve_rag_context",
            wraps=service._retrieve_rag_context,
        ):
            with patch(
                "app.services.embedding_service.EmbeddingService",
                return_value=mock_emb_service,
            ):
                # Patch the lazy import inside the method
                with patch.dict(
                    "sys.modules",
                    {"app.services.embedding_service": _make_embedding_module(mock_emb_service)},
                ):
                    result = await service._retrieve_rag_context(
                        document_id=doc_id,
                        query="What is the document about?",
                    )

        assert result == ""

    @pytest.mark.asyncio
    async def test_returns_formatted_context_with_chunks(self) -> None:
        """_retrieve_rag_context should return a labelled, ranked context block."""
        session = _make_mock_session()
        service = AiAgentService(session)
        doc_id = uuid.uuid4()

        chunks = [
            _make_chunk_result(0, "First relevant passage.", 0.95),
            _make_chunk_result(1, "Second relevant passage.", 0.88),
        ]

        mock_emb_service = MagicMock()
        mock_emb_service.search_similar_chunks = AsyncMock(return_value=chunks)

        with patch.dict(
            "sys.modules",
            {"app.services.embedding_service": _make_embedding_module(mock_emb_service)},
        ):
            result = await service._retrieve_rag_context(
                document_id=doc_id,
                query="Tell me about the passages.",
            )

        assert "--- Relevant document context (RAG) ---" in result
        assert "[1] First relevant passage." in result
        assert "[2] Second relevant passage." in result
        assert "--- End of context ---" in result

    @pytest.mark.asyncio
    async def test_returns_empty_string_on_exception(self) -> None:
        """_retrieve_rag_context must return '' and not raise when EmbeddingService throws."""
        session = _make_mock_session()
        service = AiAgentService(session)
        doc_id = uuid.uuid4()

        mock_emb_service = MagicMock()
        mock_emb_service.search_similar_chunks = AsyncMock(
            side_effect=RuntimeError("DB connection lost")
        )

        with patch.dict(
            "sys.modules",
            {"app.services.embedding_service": _make_embedding_module(mock_emb_service)},
        ):
            result = await service._retrieve_rag_context(
                document_id=doc_id,
                query="Any query.",
            )

        # Must not raise; must return empty string (graceful degradation)
        assert result == ""

    @pytest.mark.asyncio
    async def test_single_chunk_format(self) -> None:
        """With exactly one chunk the context block contains a single [1] entry."""
        session = _make_mock_session()
        service = AiAgentService(session)
        doc_id = uuid.uuid4()

        chunks = [_make_chunk_result(0, "Only chunk.", 0.99)]

        mock_emb_service = MagicMock()
        mock_emb_service.search_similar_chunks = AsyncMock(return_value=chunks)

        with patch.dict(
            "sys.modules",
            {"app.services.embedding_service": _make_embedding_module(mock_emb_service)},
        ):
            result = await service._retrieve_rag_context(
                document_id=doc_id,
                query="query",
            )

        lines = result.splitlines()
        assert lines[0] == "--- Relevant document context (RAG) ---"
        assert lines[1] == "[1] Only chunk."
        assert lines[-1] == "--- End of context ---"
        # Exactly 3 lines: header, one chunk, footer
        assert len(lines) == 3

    @pytest.mark.asyncio
    async def test_passes_correct_args_to_embedding_service(self) -> None:
        """_retrieve_rag_context should forward document_id, query, and top_k correctly."""
        session = _make_mock_session()
        service = AiAgentService(session)
        doc_id = uuid.uuid4()
        query_text = "What are the key findings?"

        mock_emb_service = MagicMock()
        mock_emb_service.search_similar_chunks = AsyncMock(return_value=[])

        with patch.dict(
            "sys.modules",
            {"app.services.embedding_service": _make_embedding_module(mock_emb_service)},
        ):
            await service._retrieve_rag_context(
                document_id=doc_id,
                query=query_text,
                top_k=3,
            )

        mock_emb_service.search_similar_chunks.assert_awaited_once_with(
            query=query_text,
            document_id=doc_id,
            top_k=3,
        )


# ---------------------------------------------------------------------------
# AiAgentService.stream_response — RAG wiring
# ---------------------------------------------------------------------------


class TestStreamResponseRagWiring:
    """Verify stream_response calls _retrieve_rag_context only when document_id is given."""

    @pytest.mark.asyncio
    async def test_stream_response_calls_rag_when_document_id_provided(self) -> None:
        """stream_response must call _retrieve_rag_context when document_id is not None."""
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        doc_id = uuid.uuid4()

        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id, role=AiMessageRole.assistant, content="Answer."
        )

        async def fake_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            """Fake streaming that yields one token."""
            yield "Answer."

        mock_result = MagicMock()
        mock_result.stream_text = fake_stream_text
        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream = MagicMock(return_value=mock_agent_ctx)

        with (
            patch(
                "app.services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                side_effect=[mock_user_msg, mock_assistant_msg],
            ),
            patch(
                "app.services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch("app.services.ai_agent_service._build_model", return_value=MagicMock()),
            patch("app.services.ai_agent_service.Agent", return_value=mock_agent_instance),
            patch.object(
                AiAgentService,
                "_retrieve_rag_context",
                new_callable=AsyncMock,
                return_value=(
                    "--- Relevant document context (RAG) ---\n[1] Chunk A\n--- End of context ---"
                ),
            ) as mock_rag,
        ):
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Summarise",
                document_id=doc_id,
            ):
                chunks.append(chunk)

        # _retrieve_rag_context must have been called exactly once with the right args
        mock_rag.assert_awaited_once_with(document_id=doc_id, query="Summarise")

        # Streaming must still complete successfully
        done = json.loads(chunks[-1].replace("data: ", "").strip())
        assert done["type"] == "done"

    @pytest.mark.asyncio
    async def test_stream_response_does_not_call_rag_when_no_document_id(self) -> None:
        """stream_response must NOT call _retrieve_rag_context when document_id is None."""
        session = _make_mock_session()
        conv_id = uuid.uuid4()

        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id, role=AiMessageRole.assistant, content="Hi"
        )

        async def fake_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            """Fake streaming that yields one token."""
            yield "Hi"

        mock_result = MagicMock()
        mock_result.stream_text = fake_stream_text
        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream = MagicMock(return_value=mock_agent_ctx)

        with (
            patch(
                "app.services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                side_effect=[mock_user_msg, mock_assistant_msg],
            ),
            patch(
                "app.services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch("app.services.ai_agent_service._build_model", return_value=MagicMock()),
            patch("app.services.ai_agent_service.Agent", return_value=mock_agent_instance),
            patch.object(
                AiAgentService,
                "_retrieve_rag_context",
                new_callable=AsyncMock,
            ) as mock_rag,
        ):
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Hi",
                document_id=None,
            ):
                chunks.append(chunk)

        # _retrieve_rag_context must NOT have been called
        mock_rag.assert_not_awaited()

        # Streaming must still complete successfully
        done = json.loads(chunks[-1].replace("data: ", "").strip())
        assert done["type"] == "done"

    @pytest.mark.asyncio
    async def test_stream_response_rag_empty_result_does_not_alter_prompt(self) -> None:
        """When _retrieve_rag_context returns '' the stream should still complete normally."""
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        doc_id = uuid.uuid4()

        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id, role=AiMessageRole.assistant, content="Done"
        )

        async def fake_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            """Fake streaming."""
            yield "Done"

        mock_result = MagicMock()
        mock_result.stream_text = fake_stream_text
        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream = MagicMock(return_value=mock_agent_ctx)

        with (
            patch(
                "app.services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                side_effect=[mock_user_msg, mock_assistant_msg],
            ),
            patch(
                "app.services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch("app.services.ai_agent_service._build_model", return_value=MagicMock()),
            patch("app.services.ai_agent_service.Agent", return_value=mock_agent_instance),
            # RAG returns nothing (no embeddings stored yet)
            patch.object(
                AiAgentService,
                "_retrieve_rag_context",
                new_callable=AsyncMock,
                return_value="",
            ),
        ):
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Go",
                document_id=doc_id,
            ):
                chunks.append(chunk)

        done = json.loads(chunks[-1].replace("data: ", "").strip())
        assert done["type"] == "done"


# ---------------------------------------------------------------------------
# Private helper — synthetic embedding_service module
# ---------------------------------------------------------------------------


def _make_embedding_module(mock_emb_service_instance: MagicMock) -> MagicMock:
    """
    Create a synthetic module mock so that the lazy import inside
    _retrieve_rag_context resolves to a controlled EmbeddingService class.

    Args:
        mock_emb_service_instance: The pre-configured mock instance to return
            when EmbeddingService(...) is called.

    Returns:
        A MagicMock representing the app.services.embedding_service module.
    """
    module_mock = MagicMock()
    # When `EmbeddingService(session)` is called inside _retrieve_rag_context,
    # return the pre-built mock instance.
    module_mock.EmbeddingService = MagicMock(return_value=mock_emb_service_instance)
    return module_mock
