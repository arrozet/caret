"""
Unit tests for the database session module.

Verifies that the URL normalisation logic correctly transforms connection strings
for asyncpg compatibility, including scheme rewriting and sslmode handling.
"""

from app.db.session import _normalize_database_url


class TestNormalizeDatabaseUrl:
    """Test the _normalize_database_url helper function.

    Ensures the URL scheme is rewritten for asyncpg and sslmode is translated
    to a connect_args ssl context.
    """

    def test_postgresql_scheme_rewritten(self) -> None:
        """'postgresql://' URLs must be rewritten to 'postgresql+asyncpg://'."""
        # Arrange
        url = "postgresql://user:pass@host:5432/db"

        # Act
        result_url, connect_args = _normalize_database_url(url)

        # Assert
        assert result_url.startswith("postgresql+asyncpg://")

    def test_postgres_short_scheme_rewritten(self) -> None:
        """'postgres://' URLs must be rewritten to 'postgresql+asyncpg://'."""
        # Arrange
        url = "postgres://user:pass@host:5432/db"

        # Act
        result_url, connect_args = _normalize_database_url(url)

        # Assert
        assert result_url.startswith("postgresql+asyncpg://")

    def test_asyncpg_scheme_unchanged(self) -> None:
        """URLs already using 'postgresql+asyncpg://' must not be double-prefixed."""
        # Arrange
        url = "postgresql+asyncpg://user:pass@host:5432/db"

        # Act
        result_url, connect_args = _normalize_database_url(url)

        # Assert
        assert result_url.startswith("postgresql+asyncpg://")
        assert "asyncpg://asyncpg" not in result_url

    def test_sslmode_require_sets_ssl_context(self) -> None:
        """sslmode=require in the URL must be removed and a ssl context added to connect_args."""
        # Arrange
        url = "postgresql://user:pass@host:5432/db?sslmode=require"

        # Act
        result_url, connect_args = _normalize_database_url(url)

        # Assert
        assert "sslmode" not in result_url
        assert "ssl" in connect_args

    def test_sslmode_disable_does_not_set_ssl_context(self) -> None:
        """sslmode=disable must strip the param but NOT add an ssl context."""
        # Arrange
        url = "postgresql://user:pass@host:5432/db?sslmode=disable"

        # Act
        result_url, connect_args = _normalize_database_url(url)

        # Assert
        assert "sslmode" not in result_url
        assert "ssl" not in connect_args

    def test_statement_cache_size_always_zero(self) -> None:
        """connect_args must always include statement_cache_size=0 for Supabase pooler."""
        # Arrange
        url = "postgresql://user:pass@host:5432/db"

        # Act
        _, connect_args = _normalize_database_url(url)

        # Assert
        assert connect_args.get("statement_cache_size") == 0

    def test_prepared_statement_cache_size_always_zero(self) -> None:
        """connect_args must always include prepared_statement_cache_size=0."""
        # Arrange
        url = "postgresql://user:pass@host:5432/db"

        # Act
        _, connect_args = _normalize_database_url(url)

        # Assert
        assert connect_args.get("prepared_statement_cache_size") == 0

    def test_password_preserved_in_url(self) -> None:
        """The database password must be preserved in the rewritten URL (not replaced with ***)."""
        # Arrange
        url = "postgresql://user:supersecret@host:5432/db"

        # Act
        result_url, _ = _normalize_database_url(url)

        # Assert
        assert "supersecret" in result_url
