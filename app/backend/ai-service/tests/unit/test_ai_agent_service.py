"""
Unit tests for the AI agent service business logic.

These tests mock the database session and PydanticAI agent so they run
without any external dependencies (no DB, no LLM API keys needed).
"""

import uuid
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.ai import AiMessageRole, AiSuggestionStatus
from app.services.ai_agent_service import AiAgentService


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
    from datetime import datetime, timezone

    conv.created_at = datetime.now(timezone.utc)
    conv.updated_at = datetime.now(timezone.utc)
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
    from datetime import datetime, timezone

    msg.created_at = datetime.now(timezone.utc)
    msg.updated_at = datetime.now(timezone.utc)
    return msg


# ---------------------------------------------------------------------------
# AiAgentService — conversation lifecycle
# ---------------------------------------------------------------------------


class TestAiAgentServiceConversations:
    """Test conversation creation and retrieval."""

    @pytest.mark.asyncio
    async def test_create_conversation(self) -> None:
        """create_conversation should return a ConversationResponse DTO."""
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        user_id = uuid.uuid4()
        mock_conv = _make_mock_conversation(doc_id=doc_id, user_id=user_id)

        with patch(
            "app.services.ai_agent_service.AiConversationRepository.create",
            new_callable=AsyncMock,
            return_value=mock_conv,
        ):
            service = AiAgentService(session)
            result = await service.create_conversation(
                document_id=doc_id,
                user_id=user_id,
                title="My convo",
            )

        assert result.document_id == doc_id
        assert result.user_id == user_id

    @pytest.mark.asyncio
    async def test_get_or_create_uses_existing_conversation(self) -> None:
        """get_or_create_conversation should reuse the most-recent existing conversation."""
        session = _make_mock_session()
        doc_id = uuid.uuid4()
        user_id = uuid.uuid4()
        existing = _make_mock_conversation(doc_id=doc_id, user_id=user_id)

        with patch(
            "app.services.ai_agent_service.AiConversationRepository.list_for_document",
            new_callable=AsyncMock,
            return_value=([existing], 1),
        ):
            service = AiAgentService(session)
            result = await service.get_or_create_conversation(
                document_id=doc_id,
                user_id=user_id,
            )

        assert result.id == existing.id

    @pytest.mark.asyncio
    async def test_list_messages_empty(self) -> None:
        """list_messages should return an empty list when no messages exist."""
        session = _make_mock_session()
        conv_id = uuid.uuid4()

        with patch(
            "app.services.ai_agent_service.AiMessageRepository.list_for_conversation",
            new_callable=AsyncMock,
            return_value=[],
        ):
            service = AiAgentService(session)
            result = await service.list_messages(conv_id)

        assert result.items == []
        assert result.total == 0


# ---------------------------------------------------------------------------
# AiAgentService — SSE streaming
# ---------------------------------------------------------------------------


class TestAiAgentServiceStreaming:
    """Test the SSE streaming generator."""

    @pytest.mark.asyncio
    async def test_stream_response_yields_delta_and_done(self) -> None:
        """
        stream_response should yield delta chunks followed by a 'done' event
        when the LLM succeeds.
        """
        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id, role=AiMessageRole.user)
        mock_assistant_msg = _make_mock_message(
            conversation_id=conv_id,
            role=AiMessageRole.assistant,
            content="Hello there!",
        )

        async def fake_stream_text(delta: bool = False) -> AsyncGenerator[str, None]:
            yield "Hello "
            yield "there!"

        mock_result = MagicMock()
        mock_result.stream_text = fake_stream_text
        mock_agent_ctx = MagicMock()
        mock_agent_ctx.__aenter__ = AsyncMock(return_value=mock_result)
        mock_agent_ctx.__aexit__ = AsyncMock(return_value=False)

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
            patch(
                "app.services.ai_agent_service.Agent.run_stream",
                return_value=mock_agent_ctx,
            ),
        ):
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Hi",
            ):
                chunks.append(chunk)

        assert len(chunks) >= 2  # at least one delta + one done
        # last chunk must be the done event
        import json

        last = json.loads(chunks[-1].replace("data: ", "").strip())
        assert last["type"] == "done"
        assert "message_id" in last

    @pytest.mark.asyncio
    async def test_stream_response_yields_error_on_missing_api_key(self) -> None:
        """stream_response should yield an error chunk if no LLM key is configured."""
        import json

        session = _make_mock_session()
        conv_id = uuid.uuid4()
        mock_user_msg = _make_mock_message(conversation_id=conv_id)

        with (
            patch(
                "app.services.ai_agent_service.AiMessageRepository.create",
                new_callable=AsyncMock,
                return_value=mock_user_msg,
            ),
            patch(
                "app.services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[mock_user_msg],
            ),
            patch(
                "app.services.ai_agent_service._build_model",
                side_effect=RuntimeError("No LLM API key configured."),
            ),
        ):
            service = AiAgentService(session)
            chunks = []
            async for chunk in service.stream_response(
                conversation_id=conv_id,
                user_message="Hi",
            ):
                chunks.append(chunk)

        assert len(chunks) == 1
        data = json.loads(chunks[0].replace("data: ", "").strip())
        assert data["type"] == "error"
