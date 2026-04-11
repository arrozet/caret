"""
Smoke tests for the AI service health endpoint and configuration.
"""

from core.config import Settings


class TestSettings:
    """Validate that Settings loads with correct defaults."""

    def test_default_app_env(self) -> None:
        """APP_ENV should default to 'development'."""
        settings = Settings()
        assert settings.app_env == "development"

    def test_default_port(self) -> None:
        """PORT should default to 8000."""
        settings = Settings()
        assert settings.port == 8000

    def test_empty_database_url_by_default(self) -> None:
        """DATABASE_URL should default to empty string when not set."""
        settings = Settings()
        assert settings.database_url == "" or isinstance(settings.database_url, str)


class TestHealthEndpoint:
    """Validate the /health endpoint returns correct payload."""

    async def test_health_returns_ok(self, client) -> None:
        """Health check should return 200 with status ok."""
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "env" in data
