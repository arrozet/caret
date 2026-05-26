"""
Integration tests for the suggestion lifecycle HTTP endpoints.

Tests:
  POST   /ai/suggestions                       — create suggestion
  PATCH  /ai/suggestions/{id}/status           — update status
  GET    /ai/suggestions?conversation_id=<id>  — list suggestions

Uses dependency_overrides for auth + DB session (no real PostgreSQL needed).
"""

import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from core.auth import get_current_user
from core.dependencies import get_db_session
from main import app
from models.ai import AiSuggestionStatus


def _make_mock_session() -> MagicMock:
    """Return a MagicMock that satisfies the AsyncSession interface."""
    session = MagicMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = MagicMock()
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


async def _override_get_db_session() -> AsyncGenerator:
    """Dependency override: yield a mock session."""
    yield _make_mock_session()


@pytest.fixture
async def client_with_db() -> AsyncGenerator[AsyncClient, None]:
    """AsyncClient with DB session overridden."""
    app.dependency_overrides[get_db_session] = _override_get_db_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db_session, None)


@pytest.fixture
async def client_with_auth_and_db(
    client_with_db: AsyncClient,
) -> AsyncGenerator[AsyncClient, None]:
    """AsyncClient with both DB session and JWT auth overridden."""
    mock_user = _make_mock_user()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield client_with_db
    app.dependency_overrides.pop(get_current_user, None)


def _make_mock_suggestion(
    conversation_id: uuid.UUID | None = None,
    document_id: uuid.UUID | None = None,
) -> MagicMock:
    """Build a mock AiSuggestion ORM object with required attributes."""
    now = datetime.now(UTC)
    s = MagicMock()
    s.id = uuid.uuid4()
    s.conversation_id = conversation_id or uuid.uuid4()
    s.document_id = document_id or uuid.uuid4()
    s.message_id = None
    s.status = AiSuggestionStatus.proposed
    s.original_text = None
    s.suggested_text = "Some suggested text"
    s.position_start = None
    s.position_end = None
    s.created_at = now
    s.updated_at = now
    return s


class TestSuggestionRouterIntegration:
    """Integration tests for suggestion lifecycle endpoints.

    Validates HTTP status codes, response shapes, auth requirements,
    and that the endpoints route correctly to the repository layer.
    """

    async def test_create_suggestion_requires_auth(self, client) -> None:
        """POST /ai/suggestions without auth must return 401."""
        # Arrange — no auth header
        body = {
            "conversation_id": str(uuid.uuid4()),
            "document_id": str(uuid.uuid4()),
            "suggested_text": "test",
        }

        # Act
        response = await client.post("/ai/suggestions", json=body)

        # Assert
        assert response.status_code == 401

    async def test_create_suggestion_returns_201(
        self, client_with_auth_and_db: AsyncClient
    ) -> None:
        """POST /ai/suggestions with valid body must return 201 with response data."""
        # Arrange
        doc_id = uuid.uuid4()
        conv_id = uuid.uuid4()
        mock_suggestion = _make_mock_suggestion(conversation_id=conv_id, document_id=doc_id)

        with (
            patch(
                "routers.suggestion_router.DocumentAccessRepository.get_document_access",
                new_callable=AsyncMock,
                return_value={"has_access": True},
            ),
            patch(
                "routers.suggestion_router.AiSuggestionRepository.create",
                new_callable=AsyncMock,
                return_value=mock_suggestion,
            ),
        ):
            body = {
                "conversation_id": str(conv_id),
                "document_id": str(doc_id),
                "suggested_text": "Improved paragraph text",
            }

            # Act
            response = await client_with_auth_and_db.post(
                "/ai/suggestions",
                json=body,
                headers={"Authorization": "Bearer fake-token"},
            )

            # Assert
            assert response.status_code == 201
            data = response.json()
            assert data["id"] == str(mock_suggestion.id)
            assert data["suggested_text"] == mock_suggestion.suggested_text
            assert data["conversation_id"] == str(conv_id)
            assert data["document_id"] == str(doc_id)

    async def test_create_suggestion_rejects_unauthorized_document(
        self, client_with_auth_and_db: AsyncClient
    ) -> None:
        """POST /ai/suggestions must return 403 when user has no document access."""
        # Arrange
        doc_id = uuid.uuid4()

        with patch(
            "routers.suggestion_router.DocumentAccessRepository.get_document_access",
            new_callable=AsyncMock,
            return_value={"has_access": False},
        ):
            body = {
                "conversation_id": str(uuid.uuid4()),
                "document_id": str(doc_id),
                "suggested_text": "test",
            }

            # Act
            response = await client_with_auth_and_db.post(
                "/ai/suggestions",
                json=body,
                headers={"Authorization": "Bearer fake-token"},
            )

            # Assert
            assert response.status_code == 403

    async def test_create_suggestion_rejects_nonexistent_document(
        self, client_with_auth_and_db: AsyncClient
    ) -> None:
        """POST /ai/suggestions must return 404 when document does not exist."""
        # Arrange
        doc_id = uuid.uuid4()

        with patch(
            "routers.suggestion_router.DocumentAccessRepository.get_document_access",
            new_callable=AsyncMock,
            return_value=None,
        ):
            body = {
                "conversation_id": str(uuid.uuid4()),
                "document_id": str(doc_id),
                "suggested_text": "test",
            }

            # Act
            response = await client_with_auth_and_db.post(
                "/ai/suggestions",
                json=body,
                headers={"Authorization": "Bearer fake-token"},
            )

            # Assert
            assert response.status_code == 404

    async def test_create_suggestion_rejects_empty_text(
        self, client_with_auth_and_db: AsyncClient
    ) -> None:
        """POST /ai/suggestions must return 422 for empty suggested_text."""
        # Arrange
        body = {
            "conversation_id": str(uuid.uuid4()),
            "document_id": str(uuid.uuid4()),
            "suggested_text": "",
        }

        # Act
        response = await client_with_auth_and_db.post(
            "/ai/suggestions",
            json=body,
            headers={"Authorization": "Bearer fake-token"},
        )

        # Assert
        assert response.status_code == 422

    async def test_update_status_not_found(self, client_with_auth_and_db: AsyncClient) -> None:
        """PATCH /ai/suggestions/{id}/status must return 404 for unknown ID."""
        # Arrange
        suggestion_id = uuid.uuid4()

        with patch(
            "routers.suggestion_router.AiSuggestionRepository.get_by_id",
            new_callable=AsyncMock,
            return_value=None,
        ):
            # Act
            response = await client_with_auth_and_db.patch(
                f"/ai/suggestions/{suggestion_id}/status",
                json={"status": "dismissed"},
                headers={"Authorization": "Bearer fake-token"},
            )

            # Assert
            assert response.status_code == 404

    async def test_update_status_success(self, client_with_auth_and_db: AsyncClient) -> None:
        """PATCH /ai/suggestions/{id}/status must return updated suggestion on success."""
        # Arrange
        suggestion_id = uuid.uuid4()
        doc_id = uuid.uuid4()
        mock_suggestion = _make_mock_suggestion(document_id=doc_id)
        mock_suggestion.status = AiSuggestionStatus.dismissed

        with (
            patch(
                "routers.suggestion_router.AiSuggestionRepository.get_by_id",
                new_callable=AsyncMock,
                return_value=mock_suggestion,
            ),
            patch(
                "routers.suggestion_router.AiSuggestionRepository.update_status",
                new_callable=AsyncMock,
                return_value=mock_suggestion,
            ),
            patch(
                "routers.suggestion_router.DocumentAccessRepository.get_document_access",
                new_callable=AsyncMock,
                return_value={"has_access": True},
            ),
        ):
            # Act
            response = await client_with_auth_and_db.patch(
                f"/ai/suggestions/{suggestion_id}/status",
                json={"status": "dismissed"},
                headers={"Authorization": "Bearer fake-token"},
            )

            # Assert
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "dismissed"

    async def test_list_suggestions_requires_auth(self, client) -> None:
        """GET /ai/suggestions without auth must return 401."""
        # Arrange
        conv_id = uuid.uuid4()

        # Act
        response = await client.get(f"/ai/suggestions?conversation_id={conv_id}")

        # Assert
        assert response.status_code == 401

    async def test_list_suggestions_returns_list(
        self, client_with_auth_and_db: AsyncClient
    ) -> None:
        """GET /ai/suggestions must return a list of suggestion DTOs."""
        # Arrange
        conv_id = uuid.uuid4()
        doc_id = uuid.uuid4()
        s1 = _make_mock_suggestion(conversation_id=conv_id, document_id=doc_id)
        s2 = _make_mock_suggestion(conversation_id=conv_id, document_id=doc_id)

        with patch(
            "routers.suggestion_router.AiSuggestionRepository.list_for_conversation",
            new_callable=AsyncMock,
            return_value=[s1, s2],
        ):
            # Act
            response = await client_with_auth_and_db.get(
                f"/ai/suggestions?conversation_id={conv_id}",
                headers={"Authorization": "Bearer fake-token"},
            )

            # Assert
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 2
            assert data[0]["suggested_text"] == s1.suggested_text
            assert data[1]["id"] == str(s2.id)
