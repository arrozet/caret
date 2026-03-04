"""
Pytest conftest for the AI service test suite.
Provides shared fixtures for test discovery and FastAPI test client setup.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client() -> AsyncClient:
    """Async HTTP client bound to the FastAPI app for integration tests."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
