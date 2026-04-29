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
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic_ai import (
    AgentRunResultEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartStartEvent,
)
from pydantic_ai.messages import TextPart, ToolCallPart, ToolReturnPart

from models.ai import AiMessageRole
from services.ai_agent_service import AiAgentService, _build_model, _normalize_document_context

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
    tool_calls: list[str] | None = None,
) -> MagicMock:
    """Build a mock AiMessage model."""
    msg = MagicMock()
    msg.id = uuid.uuid4()
    msg.conversation_id = conversation_id or uuid.uuid4()
    msg.role = role
    msg.content = content
    msg.token_count = None
    msg.tool_calls = list(tool_calls or [])
    msg.created_at = datetime.now(UTC)
    msg.updated_at = datetime.now(UTC)
    return msg


def _collect_model_message_parts(message_history: list) -> list[str]:
    """Return the part kinds in a model message history for assertions."""
    kinds: list[str] = []
    for message in message_history:
        kinds.append(message.kind)
        for part in message.parts:
            kinds.append(part.part_kind)
    return kinds


async def _make_event_stream(events: list[Any]) -> AsyncGenerator[Any, None]:
    """Yield a deterministic stream of synthetic PydanticAI events."""
    for event in events:
        yield event


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
                conversation_id=conv_id,
                role=AiMessageRole.assistant,
                content="Hello!",
                tool_calls=["get_document_content", "count_words"],
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
        assert result.items[1].tool_calls[0].tool_name == "get_document_content"
        assert result.items[1].tool_calls[1].tool_name == "count_words"

    @pytest.mark.asyncio
    async def test_list_messages_normalizes_legacy_string_tool_calls(self) -> None:
        """Legacy string tool-call payloads should be exposed as structured traces."""
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="Hello!",
            tool_calls=["count_words"],
        )

        with patch(
            "services.ai_agent_service.AiMessageRepository.list_for_conversation",
            new_callable=AsyncMock,
            return_value=[mock_msg],
        ):
            service = AiAgentService(session)
            result = await service.list_messages(conv_id)

        assert result.items[0].tool_calls[0].tool_name == "count_words"
        assert result.items[0].tool_calls[0].text_offset == 0


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
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="Texto mejorado.",
        )

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream_events = MagicMock(
            return_value=_make_event_stream(
                [
                    PartStartEvent(index=0, part=TextPart(content="Texto mejorado.")),
                    FunctionToolCallEvent(
                        part=ToolCallPart(
                            tool_name="propose_document_replacement",
                            args={"replacement_text": "Documento completo mejorado."},
                        )
                    ),
                    AgentRunResultEvent(result=MagicMock(output="Texto mejorado.")),
                ]
            )
        )

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
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="Texto final.",
        )

        repeated_text = "Documento final único."

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream_events = MagicMock(
            return_value=_make_event_stream(
                [
                    PartStartEvent(index=0, part=TextPart(content="Texto final.")),
                    FunctionToolCallEvent(
                        part=ToolCallPart(
                            tool_name="propose_document_replacement",
                            args={"replacement_text": repeated_text},
                        )
                    ),
                    FunctionToolCallEvent(
                        part=ToolCallPart(
                            tool_name="propose_document_replacement",
                            args={"replacement_text": repeated_text},
                        )
                    ),
                    AgentRunResultEvent(result=MagicMock(output="Texto final.")),
                ]
            )
        )

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
    async def test_stream_response_general_emits_metric_tool_call_without_document_change(
        self,
    ) -> None:
        """Metric tool calls should surface without entering document replacement flow."""
        # Arrange
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="El documento tiene 4 palabras.",
        )

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream_events = MagicMock(
            return_value=_make_event_stream(
                [
                    FunctionToolCallEvent(
                        part=ToolCallPart(
                            tool_name="count_words",
                            args={},
                        )
                    ),
                    FunctionToolResultEvent(
                        result=ToolReturnPart(
                            tool_name="count_words",
                            content={"metric_name": "count_words", "value": 4},
                        )
                    ),
                    PartStartEvent(
                        index=0,
                        part=TextPart(content="El documento tiene 4 palabras."),
                    ),
                    AgentRunResultEvent(result=MagicMock(output="El documento tiene 4 palabras.")),
                ]
            )
        )

        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test-dummy-key"}, clear=False),
            patch(
                "services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                side_effect=[mock_user_msg, mock_assistant_msg],
            ) as create_message,
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
                user_message="Cuantas palabras tiene el documento?",
                document_context="uno dos tres cuatro",
                agent_type="general",
            ):
                chunks.append(json.loads(chunk.removeprefix("data: ").strip()))

        # Assert
        tool_call_chunks = [c for c in chunks if c.get("type") == "tool_call"]
        document_change_chunks = [c for c in chunks if c.get("type") == "document_change"]
        done_chunks = [c for c in chunks if c.get("type") == "done"]

        assert len(tool_call_chunks) == 2
        assert tool_call_chunks[0]["tool_name"] == "count_words"
        assert tool_call_chunks[1]["tool_call"]["result_summary"] == "4 words"
        assert document_change_chunks == []
        assert len(done_chunks) == 1
        persisted_traces = create_message.await_args_list[1].kwargs["tool_calls"]
        assert len(persisted_traces) == 1
        assert persisted_traces[0].tool_name == "count_words"
        assert persisted_traces[0].result_summary == "4 words"

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
    async def test_stream_response_uses_structured_message_history(self) -> None:
        """stream_response should pass prior turns as structured PydanticAI messages."""
        # Arrange
        from pydantic_ai.messages import (
            ModelResponse,
            TextPart,
        )

        session = _make_mock_session()
        conv_id = uuid.uuid4()
        user_message = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.user,
            content="New request",
        )
        assistant_message = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="Prior answer",
        )
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="New answer",
        )

        async def fake_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            """Fake async generator simulating LLM token streaming."""
            yield "New answer"

        captured: dict[str, Any] = {}

        mock_result = MagicMock()
        mock_result.stream_text = fake_stream_text
        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

        def fake_run_stream(*args, **kwargs):
            captured["args"] = args
            captured["kwargs"] = kwargs
            return mock_agent_ctx

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream = MagicMock(side_effect=fake_run_stream)

        with (
            patch(
                "services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                side_effect=[user_message, mock_assistant_msg],
            ),
            patch(
                "services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[assistant_message],
            ),
            patch("services.ai_agent_service._build_model", return_value=MagicMock()),
            patch("services.ai_agent_service.Agent", return_value=mock_agent_instance),
        ):
            # Act
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="New request",
                document_context={"type": "doc", "content": [{"type": "paragraph"}]},
            ):
                chunks.append(chunk)

        # Assert
        history = captured["kwargs"]["message_history"]
        assert len(history) == 1
        assert isinstance(history[0], ModelResponse)
        assert isinstance(history[0].parts[0], TextPart)
        assert history[0].parts[0].content == "Prior answer"
        assert captured["args"][0] == "New request"

    @pytest.mark.asyncio
    async def test_stream_response_general_uses_structured_document_context(self) -> None:
        """general agent streaming should normalize structured document context into deps."""
        # Arrange
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="Texto mejorado.",
        )

        mock_agent_instance = MagicMock()
        mock_agent_instance.run_stream_events = MagicMock(
            return_value=_make_event_stream(
                [
                    PartStartEvent(index=0, part=TextPart(content="Texto mejorado.")),
                    FunctionToolCallEvent(
                        part=ToolCallPart(
                            tool_name="propose_document_replacement",
                            args={"replacement_text": "Documento completo mejorado."},
                        )
                    ),
                    AgentRunResultEvent(result=MagicMock(output="Texto mejorado.")),
                ]
            )
        )

        captured_deps: dict[str, Any] = {}

        def fake_build_general_agent(model):
            return mock_agent_instance

        def fake_general_deps(**kwargs):
            captured_deps.update(kwargs)
            return MagicMock(**kwargs)

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
            patch("agents.general_agent.build_general_agent", side_effect=fake_build_general_agent),
            patch("agents.general_agent.GeneralAgentDeps", side_effect=fake_general_deps),
        ):
            # Act
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Mejora la intro",
                document_context={"type": "doc", "content": [{"type": "paragraph"}]},
                agent_type="general",
            ):
                chunks.append(json.loads(chunk.removeprefix("data: ").strip()))

        # Assert
        document_change_chunks = [c for c in chunks if c.get("type") == "document_change"]
        assert len(document_change_chunks) == 1
        assert captured_deps["document_content"].startswith('{"type": "doc"')
        assert (
            document_change_chunks[0]["document_change"]["proposed_text"]
            == "Documento completo mejorado."
        )

    @pytest.mark.asyncio
    async def test_stream_response_general_preserves_selection_context(self) -> None:
        """general agent streaming should carry selection metadata into the change payload."""
        # Arrange
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="Texto mejorado.",
        )

        mock_agent_instance = MagicMock()
        captured_deps: dict[str, Any] = {}

        async def fake_run_stream_events(*args: Any, **kwargs: Any) -> AsyncGenerator[Any, None]:
            deps = kwargs["deps"]
            captured_deps["deps"] = deps
            deps.proposed_changes.append(
                {
                    "operation": "replace_full",
                    "proposed_text": "Texto mejorado.",
                    "original_text": "Texto original",
                    "position_start": 3,
                    "position_end": 8,
                }
            )
            yield PartStartEvent(index=0, part=TextPart(content="Texto mejorado."))
            yield AgentRunResultEvent(result=MagicMock(output="Texto mejorado."))

        mock_agent_instance.run_stream_events = MagicMock(side_effect=fake_run_stream_events)

        def fake_general_deps(**kwargs):
            captured_deps.update(kwargs)
            deps = MagicMock(**kwargs)
            deps.proposed_changes = []
            return deps

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
            patch("agents.general_agent.build_general_agent", return_value=mock_agent_instance),
            patch("agents.general_agent.GeneralAgentDeps", side_effect=fake_general_deps),
        ):
            # Act
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Mejora la intro",
                document_context={
                    "content_text": "Texto original",
                    "selection": {"from": 3, "to": 8, "text": "texto"},
                },
                agent_type="general",
            ):
                chunks.append(json.loads(chunk.removeprefix("data: ").strip()))

        # Assert
        document_change_chunks = [c for c in chunks if c.get("type") == "document_change"]
        assert len(document_change_chunks) == 1
        assert captured_deps["selection"]["text"] == "texto"
        assert document_change_chunks[0]["document_change"]["position_start"] == 3
        assert document_change_chunks[0]["document_change"]["position_end"] == 8

    def test_normalize_document_context_prefers_content_text(self) -> None:
        """_normalize_document_context should prefer a structured text snapshot when present."""
        # Arrange
        payload = {
            "content_text": "Plain snapshot",
            "content_json": {"type": "doc", "content": []},
        }

        # Act
        result = _normalize_document_context(payload)

        # Assert
        assert result == "Plain snapshot"

    def test_normalize_document_context_prefers_document_text_over_selection(self) -> None:
        """Prefer full document text over selection when both are present."""
        # Arrange
        payload = {
            "content_text": "Documento completo",
            "selection": {"from": 1, "to": 4, "text": "Doc"},
        }

        # Act
        result = _normalize_document_context(payload)

        # Assert
        assert result == "Documento completo"

    def test_normalize_document_context_serializes_content_json(self) -> None:
        """_normalize_document_context should serialize structured JSON when text is absent."""
        # Arrange
        payload = {"content_json": {"type": "doc", "content": []}}

        # Act
        result = _normalize_document_context(payload)

        # Assert
        assert result == '{"type": "doc", "content": []}'

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
            mock_settings.openrouter_api_key = ""
            mock_settings.openai_api_key = ""
            mock_settings.anthropic_api_key = ""
            mock_settings.openrouter_model = "some-model"

            # Act / Assert
            with pytest.raises(RuntimeError, match="No LLM API key configured"):
                _build_model()

    def test_build_model_raises_for_catalog_model_without_openrouter_key(self) -> None:
        """_build_model raises if a catalog model is requested without OPENROUTER_API_KEY."""
        # Arrange
        with patch("services.ai_agent_service.settings") as mock_settings:
            mock_settings.openrouter_api_key = ""
            mock_settings.openai_api_key = ""
            mock_settings.anthropic_api_key = ""

            # Act / Assert
            with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
                _build_model("x-ai/grok-4.1-fast")

    def test_build_model_prefers_openrouter_when_key_set(self) -> None:
        """_build_model should select OpenRouter when OPENROUTER_API_KEY is configured."""
        # Arrange
        with (
            patch("services.ai_agent_service.settings") as mock_settings,
            patch("services.ai_agent_service.OpenAIProvider") as mock_provider_cls,
            patch("services.ai_agent_service.OpenAIChatModel") as mock_model_cls,
        ):
            mock_settings.openrouter_api_key = "or-key-123"
            mock_settings.openai_api_key = ""
            mock_settings.anthropic_api_key = ""
            mock_settings.openrouter_model = "z-ai/glm-4.5-air:free"
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
        custom_model_id = "google/gemma-4-31b-it:free"

        with (
            patch("services.ai_agent_service.settings") as mock_settings,
            patch("services.ai_agent_service.OpenAIProvider") as mock_provider_cls,
            patch("services.ai_agent_service.OpenAIChatModel") as mock_model_cls,
        ):
            mock_settings.openrouter_api_key = "or-key-123"
            mock_settings.openai_api_key = ""
            mock_settings.anthropic_api_key = ""
            mock_settings.openrouter_model = "z-ai/glm-4.5-air:free"
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
            mock_settings.openrouter_api_key = ""
            mock_settings.openai_api_key = "sk-openai-key"
            mock_settings.anthropic_api_key = ""
            mock_settings.openrouter_model = "z-ai/glm-4.5-air:free"
            mock_provider_cls.return_value = MagicMock()
            mock_model_cls.return_value = MagicMock()

            # Act
            _build_model()

            # Assert
            mock_model_cls.assert_called_once_with("gpt-4o", provider=mock_provider_cls())
