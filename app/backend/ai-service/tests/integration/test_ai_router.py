"""
Integration tests for AI Service HTTP endpoints.

Tests run against the FastAPI app using an ASGI test client (httpx).
The database session is mocked so no real DB connection is required.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _make_conv_dict(doc_id: uuid.UUID | None = None) -> dict:
    """Build a dict matching ConversationResponse for comparison."""
    return {
        "id": str(uuid.uuid4()),
        "document_id": str(doc_id or uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "title": None,
        "created_at": _utcnow().isoformat(),
        "updated_at": _utcnow().isoformat(),
    }


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class TestHealthEndpointIntegration:
    """Verify the health endpoint is reachable via the test client."""

    async def test_health_check_returns_200(self, client) -> None:
        """GET /health should return 200 with status ok."""
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# POST /ai/conversations
# ---------------------------------------------------------------------------


class TestCreateConversation:
    """Test conversation creation endpoint."""

    async def test_create_conversation_requires_auth(self, client) -> None:
        """POST /conversations without a Bearer token must return 401."""
        response = await client.post(
            "/ai/conversations",
            json={"document_id": str(uuid.uuid4())},
        )
        assert response.status_code == 401

    async def test_create_conversation_returns_201(self, client) -> None:
        """POST /conversations with a valid mock JWT and DB should return 201."""
        doc_id = uuid.uuid4()
        mock_user = MagicMock()
        mock_user.user_id = str(uuid.uuid4())
        mock_user.email = "test@example.com"
        mock_user.role = "authenticated"

        mock_conv = MagicMock()
        mock_conv.id = uuid.uuid4()
        mock_conv.document_id = doc_id
        mock_conv.user_id = uuid.UUID(mock_user.user_id)
        mock_conv.title = None
        mock_conv.created_at = _utcnow()
        mock_conv.updated_at = _utcnow()

        with (
            patch("app.routers.ai_router.get_current_user", return_value=mock_user),
            patch(
                "app.services.ai_agent_service.AiConversationRepository.create",
                new_callable=AsyncMock,
                return_value=mock_conv,
            ),
        ):
            response = await client.post(
                "/ai/conversations",
                json={"document_id": str(doc_id)},
                headers={"Authorization": "Bearer fake-token"},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["document_id"] == str(doc_id)


# ---------------------------------------------------------------------------
# GET /ai/conversations/{id}/messages
# ---------------------------------------------------------------------------


class TestListMessages:
    """Test message listing endpoint."""

    async def test_list_messages_not_found(self, client) -> None:
        """GET /conversations/nonexistent/messages should return 404."""
        mock_user = MagicMock()
        mock_user.user_id = str(uuid.uuid4())

        with (
            patch("app.routers.ai_router.get_current_user", return_value=mock_user),
            patch(
                "app.repositories.ai_repository.AiConversationRepository.get_by_id",
                new_callable=AsyncMock,
                return_value=None,
            ),
        ):
            response = await client.get(
                f"/ai/conversations/{uuid.uuid4()}/messages",
                headers={"Authorization": "Bearer fake-token"},
            )

        assert response.status_code == 404

    async def test_list_messages_returns_empty_list(self, client) -> None:
        """GET /conversations/{id}/messages should return an empty list if no messages."""
        mock_user = MagicMock()
        mock_user.user_id = str(uuid.uuid4())
        conv_id = uuid.uuid4()

        mock_conv = MagicMock()
        mock_conv.id = conv_id

        with (
            patch("app.routers.ai_router.get_current_user", return_value=mock_user),
            patch(
                "app.repositories.ai_repository.AiConversationRepository.get_by_id",
                new_callable=AsyncMock,
                return_value=mock_conv,
            ),
            patch(
                "app.services.ai_agent_service.AiMessageRepository.list_for_conversation",
                new_callable=AsyncMock,
                return_value=[],
            ),
        ):
            response = await client.get(
                f"/ai/conversations/{conv_id}/messages",
                headers={"Authorization": "Bearer fake-token"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
