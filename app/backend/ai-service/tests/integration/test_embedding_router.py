"""
Integration tests for the embedding router HTTP endpoints.

Tests run against the FastAPI app via an ASGI test client (httpx).
Database session and JWT auth dependencies are overridden via FastAPI's
dependency_overrides mechanism — the correct approach for testing FastAPI apps.
"""

import uuid
from collections.abc import AsyncGenerator
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_user
from core.dependencies import get_db_session
from main import app

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_session() -> MagicMock:
    """Return a MagicMock that satisfies the AsyncSession interface used by dependencies."""
    from unittest.mock import AsyncMock

    session = MagicMock(spec=AsyncSession)
    session.add = MagicMock()
    session.add_all = MagicMock()
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


async def _override_get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency override: yield a mock session instead of connecting to PostgreSQL."""
    yield _make_mock_session()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def client_with_db() -> AsyncGenerator[AsyncClient, None]:
    """
    AsyncClient with the DB session dependency overridden.

    Avoids 503 errors in tests that require DB access but do not need
    a real database connection.
    """
    app.dependency_overrides[get_db_session] = _override_get_db_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db_session, None)


@pytest.fixture
async def client_with_auth_and_db(
    client_with_db: AsyncClient,
) -> AsyncGenerator[AsyncClient, None]:
    """
    AsyncClient with both DB session and JWT auth overridden.

    Use this fixture in tests that need a fully authenticated, DB-connected client.
    """
    mock_user = _make_mock_user()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield client_with_db
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# POST /embeddings/index — auth enforcement
# ---------------------------------------------------------------------------


class TestIndexEndpointAuth:
    """Verify that POST /embeddings/index enforces authentication.

    No real DB or embedding API calls are needed — the 401 is returned
    before any business logic runs.
    """

    async def test_index_requires_auth(self, client) -> None:
        """POST /ai/embeddings/index without an Authorization header must return 401."""
        # Arrange — no Authorization header

        # Act
        response = await client.post(
            "/ai/embeddings/index",
            json={
                "document_id": str(uuid.uuid4()),
                "content": "Some document content.",
            },
        )

        # Assert
        assert response.status_code == 401

    async def test_index_rejects_empty_content(self, client_with_db) -> None:
        """POST /ai/embeddings/index with empty content must return 422 (validation error)."""
        # Arrange — override auth so validation is reached
        mock_user = _make_mock_user()
        app.dependency_overrides[get_current_user] = lambda: mock_user

        try:
            # Act
            response = await client_with_db.post(
                "/ai/embeddings/index",
                json={
                    "document_id": str(uuid.uuid4()),
                    "content": "",
                },
                headers={"Authorization": "Bearer fake-token"},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        # Assert
        assert response.status_code == 422

    async def test_index_rejects_invalid_document_id(self, client_with_db) -> None:
        """POST /ai/embeddings/index with a non-UUID document_id must return 422."""
        # Arrange — override auth so validation is reached
        mock_user = _make_mock_user()
        app.dependency_overrides[get_current_user] = lambda: mock_user

        try:
            # Act
            response = await client_with_db.post(
                "/ai/embeddings/index",
                json={
                    "document_id": "not-a-uuid",
                    "content": "Valid content.",
                },
                headers={"Authorization": "Bearer fake-token"},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        # Assert
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /embeddings/search — auth enforcement
# ---------------------------------------------------------------------------


class TestSearchEndpointAuth:
    """Verify that POST /embeddings/search enforces authentication.

    No real DB or embedding API calls are needed — the 401 is returned
    before any business logic runs.
    """

    async def test_search_requires_auth(self, client) -> None:
        """POST /ai/embeddings/search without an Authorization header must return 401."""
        # Arrange — no Authorization header

        # Act
        response = await client.post(
            "/ai/embeddings/search",
            json={
                "query": "What is the main topic?",
                "document_id": str(uuid.uuid4()),
            },
        )

        # Assert
        assert response.status_code == 401

    async def test_search_rejects_empty_query(self, client_with_db) -> None:
        """POST /ai/embeddings/search with an empty query string must return 422."""
        # Arrange — override auth so validation is reached
        mock_user = _make_mock_user()
        app.dependency_overrides[get_current_user] = lambda: mock_user

        try:
            # Act
            response = await client_with_db.post(
                "/ai/embeddings/search",
                json={
                    "query": "",
                    "document_id": str(uuid.uuid4()),
                },
                headers={"Authorization": "Bearer fake-token"},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        # Assert
        assert response.status_code == 422

    async def test_search_rejects_top_k_above_maximum(self, client_with_db) -> None:
        """POST /ai/embeddings/search with top_k > 20 must return 422."""
        # Arrange — override auth so validation is reached
        mock_user = _make_mock_user()
        app.dependency_overrides[get_current_user] = lambda: mock_user

        try:
            # Act
            response = await client_with_db.post(
                "/ai/embeddings/search",
                json={
                    "query": "test query",
                    "document_id": str(uuid.uuid4()),
                    "top_k": 99,
                },
                headers={"Authorization": "Bearer fake-token"},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        # Assert
        assert response.status_code == 422

    async def test_search_rejects_top_k_below_minimum(self, client_with_db) -> None:
        """POST /ai/embeddings/search with top_k < 1 must return 422."""
        # Arrange — override auth so validation is reached
        mock_user = _make_mock_user()
        app.dependency_overrides[get_current_user] = lambda: mock_user

        try:
            # Act
            response = await client_with_db.post(
                "/ai/embeddings/search",
                json={
                    "query": "test query",
                    "document_id": str(uuid.uuid4()),
                    "top_k": 0,
                },
                headers={"Authorization": "Bearer fake-token"},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        # Assert
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# DELETE /embeddings/{document_id} — auth enforcement
# ---------------------------------------------------------------------------


class TestDeleteEndpointAuth:
    """Verify that DELETE /embeddings/{document_id} enforces authentication.

    No real DB calls needed — the 401 is returned before any business logic.
    """

    async def test_delete_requires_auth(self, client) -> None:
        """DELETE /ai/embeddings/{id} without an Authorization header must return 401."""
        # Arrange — no Authorization header

        # Act
        response = await client.delete(f"/ai/embeddings/{uuid.uuid4()}")

        # Assert
        assert response.status_code == 401

    async def test_delete_rejects_invalid_document_id(self, client_with_db) -> None:
        """DELETE /ai/embeddings/{id} with a non-UUID path parameter must return 422."""
        # Arrange — override auth so routing is reached
        mock_user = _make_mock_user()
        app.dependency_overrides[get_current_user] = lambda: mock_user

        try:
            # Act
            response = await client_with_db.delete(
                "/ai/embeddings/not-a-valid-uuid",
                headers={"Authorization": "Bearer fake-token"},
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        # Assert
        assert response.status_code == 422
