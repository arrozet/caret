"""
Integration tests for AI Service HTTP endpoints.

Tests run against the FastAPI app using an ASGI test client (httpx).
Database session and JWT auth dependencies are overridden via FastAPI's
dependency_overrides mechanism — the correct approach for testing FastAPI apps.
"""

import json
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.dependencies import get_db_session
from app.main import app

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utcnow() -> datetime:
    """Return the current UTC datetime."""
    return datetime.now(UTC)


def _make_mock_session() -> MagicMock:
    """Return a MagicMock that satisfies the AsyncSession interface used by dependencies."""
    session = MagicMock(spec=AsyncSession)
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    return session


def _make_mock_user(user_id: str | None = None) -> MagicMock:
    """Build a mock AuthUser object."""
    user = MagicMock()
    user.user_id = user_id or str(uuid.uuid4())
    user.email = "test@example.com"
    user.role = "authenticated"
    return user


def _make_mock_conv(doc_id: uuid.UUID | None = None, user_id: uuid.UUID | None = None) -> MagicMock:
    """Build a mock AiConversation ORM object."""
    conv = MagicMock()
    conv.id = uuid.uuid4()
    conv.document_id = doc_id or uuid.uuid4()
    conv.user_id = user_id or uuid.uuid4()
    conv.title = None
    conv.created_at = _utcnow()
    conv.updated_at = _utcnow()
    return conv


async def _override_get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency override: yield a mock session instead of connecting to PostgreSQL."""
    yield _make_mock_session()


@pytest.fixture
async def client_with_db() -> AsyncGenerator[AsyncClient, None]:
    """
    AsyncClient with the DB session dependency overridden.

    This avoids 503 errors in tests that require DB access but do not need
    a real database connection.
    """
    app.dependency_overrides[get_db_session] = _override_get_db_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db_session, None)


@pytest.fixture
async def client_with_auth_and_db(client_with_db: AsyncClient) -> AsyncGenerator[AsyncClient, None]:
    """
    AsyncClient with both DB session and JWT auth overridden.

    Use this fixture in tests that need a fully authenticated, DB-connected client.
    """
    mock_user = _make_mock_user()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield client_with_db
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class TestHealthEndpointIntegration:
    """Verify the health endpoint is reachable via the ASGI test client.

    The health endpoint has no auth or DB dependency so it should always
    respond with 200 regardless of infrastructure state.
    """

    async def test_health_check_returns_200(self, client) -> None:
        """GET /health should return 200 with status ok."""
        # Arrange — no setup needed

        # Act
        response = await client.get("/health")

        # Assert
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    async def test_health_check_includes_env_field(self, client) -> None:
        """GET /health response body must include the 'env' key."""
        # Arrange — no setup needed

        # Act
        response = await client.get("/health")

        # Assert
        assert "env" in response.json()


# ---------------------------------------------------------------------------
# GET /ai/models
# ---------------------------------------------------------------------------


class TestListModels:
    """Test the model catalog endpoint (no auth required).

    Validates that the endpoint returns the curated model list with the
    correct structure and default model ID.
    """

    async def test_list_models_returns_200(self, client) -> None:
        """GET /ai/models should return 200 with a non-empty model list."""
        # Arrange — no setup needed

        # Act
        response = await client.get("/ai/models")

        # Assert
        assert response.status_code == 200

    async def test_list_models_response_structure(self, client) -> None:
        """GET /ai/models response must include 'models' list and 'default_model_id'."""
        # Arrange — no setup needed

        # Act
        response = await client.get("/ai/models")
        data = response.json()

        # Assert
        assert "models" in data
        assert "default_model_id" in data
        assert isinstance(data["models"], list)
        assert len(data["models"]) > 0

    async def test_list_models_each_model_has_required_fields(self, client) -> None:
        """Every model entry must contain all required metadata fields."""
        # Arrange
        required_keys = {"id", "name", "provider", "is_free", "context_window", "description"}

        # Act
        response = await client.get("/ai/models")
        models = response.json()["models"]

        # Assert
        for model in models:
            assert required_keys.issubset(model.keys()), (
                f"Model {model.get('id')} missing keys: {required_keys - set(model.keys())}"
            )

    async def test_list_models_default_model_id_exists_in_list(self, client) -> None:
        """The 'default_model_id' must point to an entry present in the 'models' list."""
        # Arrange — no setup needed

        # Act
        response = await client.get("/ai/models")
        data = response.json()

        # Assert
        model_ids = {m["id"] for m in data["models"]}
        assert data["default_model_id"] in model_ids

    async def test_list_models_no_auth_required(self, client) -> None:
        """GET /ai/models must succeed without any Authorization header."""
        # Arrange — no authorization header

        # Act
        response = await client.get("/ai/models")

        # Assert
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# GET /ai/conversations
# ---------------------------------------------------------------------------


class TestListConversations:
    """Test conversation listing by document for authenticated users."""

    async def test_list_conversations_requires_auth(self, client) -> None:
        """GET /ai/conversations without auth must return 401."""
        response = await client.get(f"/ai/conversations?document_id={uuid.uuid4()}")
        assert response.status_code == 401

    async def test_list_conversations_returns_items(self, client_with_auth_and_db) -> None:
        """GET /ai/conversations returns paginated list ordered by recency."""
        doc_id = uuid.uuid4()
        conv = _make_mock_conv(doc_id=doc_id)

        with patch(
            "app.services.ai_agent_service.AiConversationRepository.list_for_document",
            new_callable=AsyncMock,
            return_value=([conv], 1),
        ):
            response = await client_with_auth_and_db.get(
                f"/ai/conversations?document_id={doc_id}",
                headers={"Authorization": "Bearer fake-token"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == str(conv.id)
        assert data["items"][0]["document_id"] == str(doc_id)


# ---------------------------------------------------------------------------
# POST /ai/conversations
# ---------------------------------------------------------------------------


class TestCreateConversation:
    """Test the conversation creation endpoint.

    Covers auth enforcement, successful creation, and invalid request bodies.
    The DB session and JWT auth are overridden via FastAPI dependency_overrides.
    """

    async def test_create_conversation_requires_auth(self, client) -> None:
        """POST /ai/conversations without a Bearer token must return 401."""
        # Arrange — no Authorization header

        # Act
        response = await client.post(
            "/ai/conversations",
            json={"document_id": str(uuid.uuid4())},
        )

        # Assert
        assert response.status_code == 401

    async def test_create_conversation_returns_201(self, client_with_auth_and_db) -> None:
        """POST /ai/conversations with valid auth and mocked DB should return 201."""
        # Arrange
        doc_id = uuid.uuid4()
        mock_conv = _make_mock_conv(doc_id=doc_id)

        with patch(
            "app.services.ai_agent_service.AiConversationRepository.create",
            new_callable=AsyncMock,
            return_value=mock_conv,
        ):
            # Act
            response = await client_with_auth_and_db.post(
                "/ai/conversations",
                json={"document_id": str(doc_id)},
                headers={"Authorization": "Bearer fake-token"},
            )

        # Assert
        assert response.status_code == 201
        data = response.json()
        assert data["document_id"] == str(doc_id)

    async def test_create_conversation_with_title(self, client_with_auth_and_db) -> None:
        """POST /ai/conversations with an optional title should persist it."""
        # Arrange
        doc_id = uuid.uuid4()
        title = "My test conversation"
        mock_conv = _make_mock_conv(doc_id=doc_id)
        mock_conv.title = title

        with patch(
            "app.services.ai_agent_service.AiConversationRepository.create",
            new_callable=AsyncMock,
            return_value=mock_conv,
        ):
            # Act
            response = await client_with_auth_and_db.post(
                "/ai/conversations",
                json={"document_id": str(doc_id), "title": title},
                headers={"Authorization": "Bearer fake-token"},
            )

        # Assert
        assert response.status_code == 201
        assert response.json()["title"] == title

    async def test_create_conversation_invalid_document_id(self, client_with_db) -> None:
        """POST /ai/conversations with a non-UUID document_id must return 422."""
        # Arrange — override auth so the request reaches body validation
        mock_user = _make_mock_user()
        app.dependency_overrides[get_current_user] = lambda: mock_user

        try:
            # Act
            response = await client_with_db.post(
                "/ai/conversations",
                json={"document_id": "not-a-valid-uuid"},
                headers={"Authorization": "Bearer fake-token"},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        # Assert
        assert response.status_code == 422

    async def test_create_conversation_missing_document_id(self, client_with_db) -> None:
        """POST /ai/conversations without document_id must return 422."""
        # Arrange — override auth so the request reaches body validation
        mock_user = _make_mock_user()
        app.dependency_overrides[get_current_user] = lambda: mock_user

        try:
            # Act
            response = await client_with_db.post(
                "/ai/conversations",
                json={},
                headers={"Authorization": "Bearer fake-token"},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        # Assert
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /ai/conversations/{id}/messages
# ---------------------------------------------------------------------------


class TestListMessages:
    """Test the message listing endpoint.

    Covers 404 when conversation not found and successful empty/non-empty
    message list responses.
    """

    async def test_list_messages_not_found(self, client_with_auth_and_db) -> None:
        """GET /ai/conversations/{id}/messages returns 404 when conversation missing."""
        # Arrange
        with patch(
            "app.repositories.ai_repository.AiConversationRepository.get_by_id_for_user",
            new_callable=AsyncMock,
            return_value=None,
        ):
            # Act
            response = await client_with_auth_and_db.get(
                f"/ai/conversations/{uuid.uuid4()}/messages",
                headers={"Authorization": "Bearer fake-token"},
            )

        # Assert
        assert response.status_code == 404

    async def test_list_messages_returns_empty_list(self, client_with_auth_and_db) -> None:
        """GET /ai/conversations/{id}/messages returns empty list when no messages exist."""
        # Arrange
        conv_id = uuid.uuid4()
        mock_conv = _make_mock_conv()
        mock_conv.id = conv_id

        with (
            patch(
                "app.repositories.ai_repository.AiConversationRepository.get_by_id_for_user",
                new_callable=AsyncMock,
                return_value=mock_conv,
            ),
            patch(
                "app.services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[],
            ),
        ):
            # Act
            response = await client_with_auth_and_db.get(
                f"/ai/conversations/{conv_id}/messages",
                headers={"Authorization": "Bearer fake-token"},
            )

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_list_messages_requires_auth(self, client) -> None:
        """GET /ai/conversations/{id}/messages without auth must return 401."""
        # Arrange — no Authorization header

        # Act
        response = await client.get(
            f"/ai/conversations/{uuid.uuid4()}/messages",
        )

        # Assert
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /ai/conversations/{id}
# ---------------------------------------------------------------------------


class TestDeleteConversation:
    """Test the conversation deletion endpoint.

    Verifies 204 on success and 404 when the conversation does not exist.
    """

    async def test_delete_conversation_returns_204(self, client_with_auth_and_db) -> None:
        """DELETE /ai/conversations/{id} should return 204 when conversation exists."""
        # Arrange
        conv_id = uuid.uuid4()

        with patch(
            "app.repositories.ai_repository.AiConversationRepository.get_by_id_for_user",
            new_callable=AsyncMock,
            return_value=_make_mock_conv(),
        ):
            with patch(
                "app.repositories.ai_repository.AiConversationRepository.delete",
                new_callable=AsyncMock,
                return_value=True,
            ):
                # Act
                response = await client_with_auth_and_db.delete(
                    f"/ai/conversations/{conv_id}",
                    headers={"Authorization": "Bearer fake-token"},
                )

        # Assert
        assert response.status_code == 204

    async def test_delete_conversation_not_found(self, client_with_auth_and_db) -> None:
        """DELETE /ai/conversations/{id} should return 404 when conversation not found."""
        # Arrange
        with patch(
            "app.repositories.ai_repository.AiConversationRepository.get_by_id_for_user",
            new_callable=AsyncMock,
            return_value=None,
        ):
            # Act
            response = await client_with_auth_and_db.delete(
                f"/ai/conversations/{uuid.uuid4()}",
                headers={"Authorization": "Bearer fake-token"},
            )

        # Assert
        assert response.status_code == 404

    async def test_delete_conversation_requires_auth(self, client) -> None:
        """DELETE /ai/conversations/{id} without auth must return 401."""
        # Arrange — no Authorization header

        # Act
        response = await client.delete(f"/ai/conversations/{uuid.uuid4()}")

        # Assert
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /ai/conversations/{id}/stream
# ---------------------------------------------------------------------------


class TestStreamAiResponse:
    """Test the SSE streaming endpoint.

    Verifies 404 when conversation missing, 422 for invalid payloads,
    and 200 with correct SSE content-type for valid requests.
    """

    async def test_stream_requires_auth(self, client) -> None:
        """POST /ai/conversations/{id}/stream without auth must return 401."""
        # Arrange — no Authorization header

        # Act
        response = await client.post(
            f"/ai/conversations/{uuid.uuid4()}/stream",
            json={"message": "Hello"},
        )

        # Assert
        assert response.status_code == 401

    async def test_stream_conversation_not_found(self, client_with_auth_and_db) -> None:
        """POST /ai/conversations/{id}/stream returns 404 when conversation not found."""
        # Arrange
        with patch(
            "app.repositories.ai_repository.AiConversationRepository.get_by_id_for_user",
            new_callable=AsyncMock,
            return_value=None,
        ):
            # Act
            response = await client_with_auth_and_db.post(
                f"/ai/conversations/{uuid.uuid4()}/stream",
                json={"message": "Hello"},
                headers={"Authorization": "Bearer fake-token"},
            )

        # Assert
        assert response.status_code == 404

    async def test_stream_empty_message_rejected(self, client_with_auth_and_db) -> None:
        """POST /ai/conversations/{id}/stream with empty message must return 422."""
        # Arrange — empty message string

        # Act
        response = await client_with_auth_and_db.post(
            f"/ai/conversations/{uuid.uuid4()}/stream",
            json={"message": ""},
            headers={"Authorization": "Bearer fake-token"},
        )

        # Assert
        assert response.status_code == 422

    async def test_stream_returns_event_stream_content_type(self, client_with_auth_and_db) -> None:
        """POST /ai/conversations/{id}/stream should return text/event-stream content-type."""
        # Arrange
        conv_id = uuid.uuid4()
        mock_conv = _make_mock_conv()
        mock_conv.id = conv_id

        async def _fake_stream(*args, **kwargs):
            """Minimal fake SSE generator that yields one done chunk."""
            yield 'data: {"type": "done", "content": "ok", "message_id": null}\n\n'

        with (
            patch(
                "app.repositories.ai_repository.AiConversationRepository.get_by_id_for_user",
                new_callable=AsyncMock,
                return_value=mock_conv,
            ),
            patch(
                "app.services.ai_agent_service.AiAgentService.stream_response",
                return_value=_fake_stream(),
            ),
        ):
            # Act
            response = await client_with_auth_and_db.post(
                f"/ai/conversations/{conv_id}/stream",
                json={"message": "Hello there"},
                headers={"Authorization": "Bearer fake-token"},
            )

        # Assert
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

    async def test_stream_yields_sse_chunks(self, client_with_auth_and_db) -> None:
        """POST /ai/conversations/{id}/stream response body contains valid SSE data lines."""
        # Arrange
        conv_id = uuid.uuid4()
        mock_conv = _make_mock_conv()
        mock_conv.id = conv_id
        assistant_msg_id = uuid.uuid4()

        async def _fake_stream(*args, **kwargs):
            """Yields a delta chunk followed by a done chunk."""
            yield 'data: {"type": "delta", "content": "Hello", "message_id": null}\n\n'
            yield (
                f'data: {{"type": "done", "content": "Hello", '
                f'"message_id": "{assistant_msg_id}"}}\n\n'
            )

        with (
            patch(
                "app.repositories.ai_repository.AiConversationRepository.get_by_id_for_user",
                new_callable=AsyncMock,
                return_value=mock_conv,
            ),
            patch(
                "app.services.ai_agent_service.AiAgentService.stream_response",
                return_value=_fake_stream(),
            ),
        ):
            # Act
            response = await client_with_auth_and_db.post(
                f"/ai/conversations/{conv_id}/stream",
                json={"message": "Hello"},
                headers={"Authorization": "Bearer fake-token"},
            )

        # Assert
        assert response.status_code == 200
        raw_text = response.text
        lines = [ln for ln in raw_text.splitlines() if ln.startswith("data:")]
        assert len(lines) == 2
        delta = json.loads(lines[0][len("data: ") :])
        done = json.loads(lines[1][len("data: ") :])
        assert delta["type"] == "delta"
        assert done["type"] == "done"
        assert done["message_id"] == str(assistant_msg_id)
