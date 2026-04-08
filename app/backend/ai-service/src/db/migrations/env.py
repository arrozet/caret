"""
Alembic migrations environment — async-compatible.

Uses asyncpg via SQLAlchemy's async engine so that both the app and
migrations share the same driver and connection semantics.

Run migrations:
  uv run alembic upgrade head
  uv run alembic downgrade -1
"""

import asyncio
import sys
from logging.config import fileConfig
from pathlib import Path

# Make sure the src directory is on sys.path so that `from core.xxx import ...`
# always resolves, regardless of how alembic is invoked.
_src_root = Path(__file__).parents[3]
if str(_src_root) not in sys.path:
    sys.path.insert(0, str(_src_root))

from alembic import context  # noqa: E402
from sqlalchemy import pool  # noqa: E402
from sqlalchemy.engine import Connection  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

# Import application settings (DATABASE_URL) and the ORM Base for
# autogenerate support.
from core.config import settings  # noqa: E402
from db.session import _normalize_database_url  # noqa: E402
from models.ai import Base  # noqa: F401,E402 — registers all ORM models

# ---------------------------------------------------------------------------
# Alembic Config object (gives access to values from alembic.ini)
# ---------------------------------------------------------------------------
config = context.config

# Set up Python logging from the alembic.ini [loggers] section.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Provide ORM metadata for autogenerate (alembic revision --autogenerate).
target_metadata = Base.metadata


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_url_and_connect_args() -> tuple[str, dict]:
    """
    Resolve the database URL and asyncpg connect_args from application settings.
    Returns the (clean_url, connect_args) tuple produced by _normalize_database_url,
    which strips libpq-specific parameters (e.g. sslmode) and builds the asyncpg
    ssl.SSLContext and prepared-statement settings.
    """
    url = settings.DATABASE_URL
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Export it as an environment variable before running Alembic."
        )
    return _normalize_database_url(url)


def run_migrations_offline() -> None:
    """
    Run migrations in "offline" mode.

    In offline mode Alembic emits SQL statements to stdout / a file rather
    than executing them against a live database.  Useful for generating a
    SQL script that a DBA can review before applying.
    """
    url, _ = _get_url_and_connect_args()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Execute pending migrations against the provided synchronous connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """
    Create an async engine and run migrations inside a synchronous wrapper.

    Alembic's migration runner is synchronous; we use
    ``Connection.run_sync`` to bridge the async/sync boundary.
    connect_args must be passed here so that the SSL context and
    prepared-statement settings are applied to the migration connection.
    """
    url, connect_args = _get_url_and_connect_args()
    connectable = create_async_engine(
        url,
        poolclass=pool.NullPool,  # single-use connection — no pooling during migrations
        connect_args=connect_args,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """
    Run migrations in "online" mode (execute against a live database).
    Delegates to the async runner via asyncio.run.
    """
    asyncio.run(run_async_migrations())


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
