"""
Unit tests for the AI agent service business logic.

These tests mock the database session and PydanticAI agent so they run
without any external dependencies (no DB, no LLM API keys needed).
"""

import json
import os
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.ai import AiMessageRole
from services.ai_agent_service import AiAgentService, _build_model


class _FakeAgentMessage:
    """Lightweight message container exposing only the `parts` attribute."""

    def __init__(self, parts: list) -> None:
        self.parts = parts


# ---------------------------------------------------------------------------
# Helpers / fixtures
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


def _make_mock_conversation(
    doc_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
) -> MagicMock:
    """Build a mock AiConversation model."""
    conv = MagicMock()
    conv.id = uuid.uuid4()
    conv.document_id = doc_id or uuid.uuid4()
    conv.user_id = user_id or uuid.uuid4()
    conv.title = "Test conversation"
    conv.created_at = datetime.now(UTC)
    conv.updated_at = datetime.now(UTC)
    return conv


def _make_mock_message(
    conversation_id: uuid.UUID | None = None,
    role: AiMessageRole = AiMessageRole.user,
    content: str = "Hello",
) -> MagicMock:
    """Build a mock AiMessage model."""
    msg = MagicMock()
    msg.id = uuid.uuid4()
    msg.conversation_id = conversation_id or uuid.uuid4()
    msg.role = role
    msg.content = content
    msg.token_count = None
    msg.created_at = datetime.now(UTC)
    msg.updated_at = datetime.now(UTC)
    return msg


# ---------------------------------------------------------------------------
# AiAgentService — conversation lifecycle
# ---------------------------------------------------------------------------


class TestAiAgentServiceConversations:
    """Test conversation creation and retrieval.

    Verifies that the service layer correctly delegates to the repository
    and maps ORM objects to Pydantic response DTOs.
    """

    @pytest.mark.asyncio
    async def test_create_conversation(self) -> None:
        """create_conversation should return a ConversationResponse DTO with correct fields."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        user_id = uuid.uuid4()
        mock_conv = _make_mock_conversation(doc_id=doc_id, user_id=user_id)

        with patch(
            "services.ai_agent_service.AiConversationRepository.create",
            new_callable=AsyncMock,
            return_value=mock_conv,
        ):
            # Act
            service = AiAgentService(session)
            result = await service.create_conversation(
                document_id=doc_id,
                user_id=user_id,
                title="My convo",
            )

        # Assert
        assert result.document_id == doc_id
        assert result.user_id == user_id

    @pytest.mark.asyncio
    async def test_create_conversation_without_title(self) -> None:
        """create_conversation with title=None should still succeed."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        user_id = uuid.uuid4()
        mock_conv = _make_mock_conversation(doc_id=doc_id, user_id=user_id)
        mock_conv.title = None

        with patch(
            "services.ai_agent_service.AiConversationRepository.create",
            new_callable=AsyncMock,
            return_value=mock_conv,
        ):
            # Act
            service = AiAgentService(session)
            result = await service.create_conversation(
                document_id=doc_id,
                user_id=user_id,
            )

        # Assert
        assert result.title is None

    @pytest.mark.asyncio
    async def test_get_or_create_uses_existing_conversation(self) -> None:
        """get_or_create_conversation should reuse the most-recent existing conversation."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        user_id = uuid.uuid4()
        existing = _make_mock_conversation(doc_id=doc_id, user_id=user_id)

        with patch(
            "services.ai_agent_service.AiConversationRepository.list_for_document",
            new_callable=AsyncMock,
            return_value=([existing], 1),
        ):
            # Act
            service = AiAgentService(session)
            result = await service.get_or_create_conversation(
                document_id=doc_id,
                user_id=user_id,
            )

        # Assert
        assert result.id == existing.id

    @pytest.mark.asyncio
    async def test_get_or_create_creates_when_none_exists(self) -> None:
        """get_or_create_conversation should create a new one when the list is empty."""
        # Arrange
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        user_id = uuid.uuid4()
        new_conv = _make_mock_conversation(doc_id=doc_id, user_id=user_id)

        with (
            patch(
                "services.ai_agent_service.AiConversationRepository.list_for_document",
                new_callable=AsyncMock,
                return_value=([], 0),
            ),
            patch(
                "services.ai_agent_service.AiConversationRepository.create",
                new_callable=AsyncMock,
                return_value=new_conv,
            ),
        ):
            # Act
            service = AiAgentService(session)
            result = await service.get_or_create_conversation(
                document_id=doc_id,
                user_id=user_id,
            )

        # Assert
        assert result.id == new_conv.id

    @pytest.mark.asyncio
    async def test_list_messages_empty(self) -> None:
        """list_messages should return an empty list and total=0 when no messages exist."""
        # Arrange
        session = _make_mock_session()
        conv_id = uuid.uuid4()

        with patch(
            "services.ai_agent_service.AiMessageRepository.list_for_conversation",
            new_callable=AsyncMock,
            return_value=[],
        ):
            # Act
            service = AiAgentService(session)
            result = await service.list_messages(conv_id)

        # Assert
        assert result.items == []
        assert result.total == 0

    @pytest.mark.asyncio
    async def test_list_messages_returns_all_messages(self) -> None:
        """list_messages should map all returned ORM rows to MessageResponse DTOs."""
        # Arrange
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_msgs = [
            _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user, content="Hi"),
            _make_mock_message(
                conversation_id=conv_id, role=AiMessageRole.assistant, content="Hello!"
            ),
        ]

        with patch(
            "services.ai_agent_service.AiMessageRepository.list_for_conversation",
            new_callable=AsyncMock,
            return_value=mock_msgs,
        ):
            # Act
            service = AiAgentService(session)
            result = await service.list_messages(conv_id)

        # Assert
        assert result.total == 2
        assert result.items[0].role == AiMessageRole.user
        assert result.items[1].role == AiMessageRole.assistant


# ---------------------------------------------------------------------------
# AiAgentService — SSE streaming
# ---------------------------------------------------------------------------


class TestAiAgentServiceStreaming:
    """Test the SSE streaming generator.

    Verifies the correct SSE event sequence (delta → done) and error handling
    for missing LLM API keys and agent exceptions, without calling real LLMs.
    """

    @pytest.mark.asyncio
    async def test_stream_response_general_falls_back_to_replacement_text_tool_args(self) -> None:
        """General-agent stream emits document_change when tool args use replacement_text."""
        # Arrange
        from pydantic_ai.messages import ToolCallPart

        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="Texto mejorado.",
        )

        async def fake_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            """Fake async generator simulating one streamed assistant token chunk."""
            yield "Texto mejorado."

        mock_result = MagicMock()
        mock_result.stream_text = fake_stream_text
        mock_result.all_messages = MagicMock(
            return_value=[
                _FakeAgentMessage(
                    [
                        ToolCallPart(tool_name="get_document_content", args={}),
                        ToolCallPart(
                            tool_name="propose_document_replacement",
                            args={"replacement_text": "Documento completo mejorado."},
                        ),
                    ]
                )
            ]
        )

        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream = MagicMock(return_value=mock_agent_ctx)

        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test-dummy-key"}, clear=False),
            patch(
                "services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                side_effect=[mock_user_msg, mock_assistant_msg],
            ),
            patch(
                "services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch("services.ai_agent_service._build_model", return_value=MagicMock()),
            patch(
                "agents.general_agent.build_general_agent",
                return_value=mock_agent_instance,
            ),
        ):
            # Act
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Mejora la intro",
                document_context="Texto original",
                agent_type="general",
            ):
                chunks.append(json.loads(chunk.removeprefix("data: ").strip()))

        # Assert
        document_change_chunks = [c for c in chunks if c.get("type") == "document_change"]
        assert len(document_change_chunks) == 1
        assert (
            document_change_chunks[0]["document_change"]["proposed_text"]
            == "Documento completo mejorado."
        )
        assert document_change_chunks[0]["document_change"]["original_text"] == "Texto original"

    @pytest.mark.asyncio
    async def test_stream_response_general_emits_fallback_change_once_for_duplicate_tool_args(
        self,
    ) -> None:
        """Duplicate replacement args from repeated tool calls produce one document_change event."""
        # Arrange
        from pydantic_ai.messages import ToolCallPart

        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="Texto final.",
        )

        async def fake_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            """Fake async generator simulating one streamed assistant token chunk."""
            yield "Texto final."

        repeated_text = "Documento final único."
        mock_result = MagicMock()
        mock_result.stream_text = fake_stream_text
        mock_result.all_messages = MagicMock(
            return_value=[
                _FakeAgentMessage(
                    [
                        ToolCallPart(
                            tool_name="propose_document_replacement",
                            args={"replacement_text": repeated_text},
                        ),
                        ToolCallPart(
                            tool_name="propose_document_replacement",
                            args={"replacement_text": repeated_text},
                        ),
                    ]
                )
            ]
        )

        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream = MagicMock(return_value=mock_agent_ctx)

        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test-dummy-key"}, clear=False),
            patch(
                "services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                side_effect=[mock_user_msg, mock_assistant_msg],
            ),
            patch(
                "services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch("services.ai_agent_service._build_model", return_value=MagicMock()),
            patch(
                "agents.general_agent.build_general_agent",
                return_value=mock_agent_instance,
            ),
        ):
            # Act
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Hazlo mejor",
                document_context="Texto base",
                agent_type="general",
            ):
                chunks.append(json.loads(chunk.removeprefix("data: ").strip()))

        # Assert
        document_change_chunks = [c for c in chunks if c.get("type") == "document_change"]
        assert len(document_change_chunks) == 1
        assert document_change_chunks[0]["document_change"]["proposed_text"] == repeated_text

    @pytest.mark.asyncio
    async def test_stream_response_yields_delta_and_done(self) -> None:
        """stream_response should yield delta chunks followed by a 'done' event."""
        # Arrange
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="Hello there!",
        )

        async def fake_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            """Fake async generator simulating LLM token streaming."""
            yield "Hello "
            yield "there!"

        mock_result = MagicMock()
        mock_result.stream_text = fake_stream_text
        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream = MagicMock(return_value=mock_agent_ctx)

        with (
            patch(
                "services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                side_effect=[mock_user_msg, mock_assistant_msg],
            ),
            patch(
                "services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch("services.ai_agent_service._build_model", return_value=MagicMock()),
            # Patch the Agent class itself to return our fully-controlled mock instance
            patch(
                "services.ai_agent_service.Agent",
                return_value=mock_agent_instance,
            ),
        ):
            # Act
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Hi",
            ):
                chunks.append(chunk)

        # Assert
        assert len(chunks) >= 2  # at least one delta + one done
        last = json.loads(chunks[-1].replace("data: ", "").strip())
        assert last["type"] == "done"
        assert "message_id" in last

    @pytest.mark.asyncio
    async def test_stream_response_yields_delta_content(self) -> None:
        """stream_response delta chunks must contain the actual LLM token text."""
        # Arrange
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="Hi!",
        )

        async def fake_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            """Yields a single token."""
            yield "Hi!"

        mock_result = MagicMock()
        mock_result.stream_text = fake_stream_text
        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream = MagicMock(return_value=mock_agent_ctx)

        with (
            patch(
                "services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                side_effect=[mock_user_msg, mock_assistant_msg],
            ),
            patch(
                "services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch("services.ai_agent_service._build_model", return_value=MagicMock()),
            patch(
                "services.ai_agent_service.Agent",
                return_value=mock_agent_instance,
            ),
        ):
            # Act
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Hello",
            ):
                chunks.append(chunk)

        # Assert
        # model_dump_json() produces compact JSON (no spaces after colons),
        # so parse each SSE line as JSON and filter by the 'type' field.
        delta_chunks = [
            json.loads(c.removeprefix("data: ").strip())
            for c in chunks
            if json.loads(c.removeprefix("data: ").strip()).get("type") == "delta"
        ]
        assert len(delta_chunks) == 1
        assert delta_chunks[0]["content"] == "Hi!"

    @pytest.mark.asyncio
    async def test_stream_response_done_chunk_contains_full_text(self) -> None:
        """The 'done' chunk must contain the full accumulated text from all deltas."""
        # Arrange
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="Hello World",
        )

        async def fake_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            """Yields two tokens that together form the full response."""
            yield "Hello "
            yield "World"

        mock_result = MagicMock()
        mock_result.stream_text = fake_stream_text
        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream = MagicMock(return_value=mock_agent_ctx)

        with (
            patch(
                "services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                side_effect=[mock_user_msg, mock_assistant_msg],
            ),
            patch(
                "services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch("services.ai_agent_service._build_model", return_value=MagicMock()),
            patch(
                "services.ai_agent_service.Agent",
                return_value=mock_agent_instance,
            ),
        ):
            # Act
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Hi",
            ):
                chunks.append(chunk)

        # Assert
        done_chunk = json.loads(chunks[-1].replace("data: ", "").strip())
        assert done_chunk["type"] == "done"
        assert done_chunk["content"] == "Hello World"

    @pytest.mark.asyncio
    async def test_stream_response_yields_error_on_missing_api_key(self) -> None:
        """stream_response should yield a single error chunk if no LLM key is configured."""
        # Arrange
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id)

        with (
            patch(
                "services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                return_value=mock_user_msg,
            ),
            patch(
                "services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch(
                "services.ai_agent_service._build_model",
                side_effect=RuntimeError("No LLM API key configured."),
            ),
        ):
            # Act
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Hi",
            ):
                chunks.append(chunk)

        # Assert
        assert len(chunks) == 1
        data = json.loads(chunks[0].replace("data: ", "").strip())
        assert data["type"] == "error"

    @pytest.mark.asyncio
    async def test_stream_response_yields_error_on_agent_exception(self) -> None:
        """stream_response should yield an error chunk when the PydanticAI agent raises."""
        # Arrange
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id)

        async def raising_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            """Simulate an agent that raises mid-stream."""
            raise RuntimeError("LLM timeout")
            yield  # make it a generator

        mock_result = MagicMock()
        mock_result.stream_text = raising_stream_text
        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream = MagicMock(return_value=mock_agent_ctx)

        with (
            patch(
                "services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                return_value=mock_user_msg,
            ),
            patch(
                "services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch("services.ai_agent_service._build_model", return_value=MagicMock()),
            patch(
                "services.ai_agent_service.Agent",
                return_value=mock_agent_instance,
            ),
        ):
            # Act
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Hi",
            ):
                chunks.append(chunk)

        # Assert
        # model_dump_json() produces compact JSON (no spaces after colons),
        # so parse each SSE line as JSON and filter by the 'type' field.
        error_chunks = [
            json.loads(c.removeprefix("data: ").strip())
            for c in chunks
            if json.loads(c.removeprefix("data: ").strip()).get("type") == "error"
        ]
        assert len(error_chunks) >= 1
        assert error_chunks[0]["type"] == "error"

    @pytest.mark.asyncio
    async def test_stream_response_with_document_context(self) -> None:
        """stream_response with document_context should not raise and yield done chunk."""
        # Arrange
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id, role=AiMessageRole.assistant, content="ok"
        )

        async def fake_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            yield "ok"

        mock_result = MagicMock()
        mock_result.stream_text = fake_stream_text
        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream = MagicMock(return_value=mock_agent_ctx)

        with (
            patch(
                "services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                side_effect=[mock_user_msg, mock_assistant_msg],
            ),
            patch(
                "services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch("services.ai_agent_service._build_model", return_value=MagicMock()),
            patch(
                "services.ai_agent_service.Agent",
                return_value=mock_agent_instance,
            ),
        ):
            # Act
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Summarise",
                document_context="The quick brown fox jumps over the lazy dog.",
            ):
                chunks.append(chunk)

        # Assert
        done = json.loads(chunks[-1].replace("data: ", "").strip())
        assert done["type"] == "done"

    @pytest.mark.asyncio
    async def test_stream_sse_format_prefix(self) -> None:
        """Each yielded chunk must start with 'data: ' and end with double newline."""
        # Arrange
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id, role=AiMessageRole.assistant, content="test"
        )

        async def fake_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            yield "test"

        mock_result = MagicMock()
        mock_result.stream_text = fake_stream_text
        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream = MagicMock(return_value=mock_agent_ctx)

        with (
            patch(
                "services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                side_effect=[mock_user_msg, mock_assistant_msg],
            ),
            patch(
                "services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch("services.ai_agent_service._build_model", return_value=MagicMock()),
            patch(
                "services.ai_agent_service.Agent",
                return_value=mock_agent_instance,
            ),
        ):
            # Act
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Hi",
            ):
                chunks.append(chunk)

        # Assert
        for chunk in chunks:
            assert chunk.startswith("data: "), f"Chunk must start with 'data: ', got: {chunk!r}"
            assert chunk.endswith("\n\n"), f"Chunk must end with '\\n\\n', got: {chunk!r}"


# ---------------------------------------------------------------------------
# _build_model — model selector
# ---------------------------------------------------------------------------


class TestBuildModel:
    """Unit tests for the _build_model helper function.

    Verifies the model selection priority logic based on configured API keys,
    without making any actual HTTP calls or importing real provider SDKs.
    """

    def test_build_model_raises_when_no_keys_configured(self) -> None:
        """_build_model should raise RuntimeError when no API keys are set."""
        # Arrange
        with patch("services.ai_agent_service.settings") as mock_settings:
            mock_settings.XAI_API_KEY = ""
            mock_settings.OPENROUTER_API_KEY = ""
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.ANTHROPIC_API_KEY = ""
            mock_settings.OPENROUTER_MODEL = "some-model"

            # Act / Assert
            with pytest.raises(RuntimeError, match="No LLM API key configured"):
                _build_model()

    def test_build_model_raises_for_grok_without_xai_key(self) -> None:
        """_build_model should raise RuntimeError for grok- model when XAI_API_KEY is missing."""
        # Arrange
        with patch("services.ai_agent_service.settings") as mock_settings:
            mock_settings.XAI_API_KEY = ""
            mock_settings.OPENROUTER_API_KEY = ""
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.ANTHROPIC_API_KEY = ""

            # Act / Assert
            with pytest.raises(RuntimeError, match="XAI_API_KEY"):
                _build_model("grok-4-fast")

    def test_build_model_prefers_openrouter_when_key_set(self) -> None:
        """_build_model should select OpenRouter when OPENROUTER_API_KEY is configured."""
        # Arrange
        with (
            patch("services.ai_agent_service.settings") as mock_settings,
            patch("services.ai_agent_service.OpenAIProvider") as mock_provider_cls,
            patch("services.ai_agent_service.OpenAIChatModel") as mock_model_cls,
        ):
            mock_settings.XAI_API_KEY = ""
            mock_settings.OPENROUTER_API_KEY = "or-key-123"
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.ANTHROPIC_API_KEY = ""
            mock_settings.OPENROUTER_MODEL = "z-ai/glm-4.5-air:free"
            mock_provider_cls.return_value = MagicMock()
            mock_model_cls.return_value = MagicMock()

            # Act
            _build_model()

            # Assert
            mock_provider_cls.assert_called_once_with(
                base_url="https://openrouter.ai/api/v1",
                api_key="or-key-123",
            )
            mock_model_cls.assert_called_once()

    def test_build_model_uses_custom_model_id_on_openrouter(self) -> None:
        """_build_model should use the provided model_id when OPENROUTER_API_KEY is set."""
        # Arrange
        custom_model_id = "qwen/qwen3-coder:free"

        with (
            patch("services.ai_agent_service.settings") as mock_settings,
            patch("services.ai_agent_service.OpenAIProvider") as mock_provider_cls,
            patch("services.ai_agent_service.OpenAIChatModel") as mock_model_cls,
        ):
            mock_settings.XAI_API_KEY = ""
            mock_settings.OPENROUTER_API_KEY = "or-key-123"
            mock_settings.OPENAI_API_KEY = ""
            mock_settings.ANTHROPIC_API_KEY = ""
            mock_settings.OPENROUTER_MODEL = "z-ai/glm-4.5-air:free"
            mock_provider_cls.return_value = MagicMock()
            mock_model_cls.return_value = MagicMock()

            # Act
            _build_model(custom_model_id)

            # Assert
            mock_model_cls.assert_called_once_with(custom_model_id, provider=mock_provider_cls())

    def test_build_model_falls_back_to_openai(self) -> None:
        """_build_model should use OpenAI when only OPENAI_API_KEY is configured."""
        # Arrange
        with (
            patch("services.ai_agent_service.settings") as mock_settings,
            patch("services.ai_agent_service.OpenAIProvider") as mock_provider_cls,
            patch("services.ai_agent_service.OpenAIChatModel") as mock_model_cls,
        ):
            mock_settings.XAI_API_KEY = ""
            mock_settings.OPENROUTER_API_KEY = ""
            mock_settings.OPENAI_API_KEY = "sk-openai-key"
            mock_settings.ANTHROPIC_API_KEY = ""
            mock_settings.OPENROUTER_MODEL = "z-ai/glm-4.5-air:free"
            mock_provider_cls.return_value = MagicMock()
            mock_model_cls.return_value = MagicMock()

            # Act
            _build_model()

            # Assert
            mock_model_cls.assert_called_once_with("gpt-4o", provider=mock_provider_cls())
