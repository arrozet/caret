from sqlalchemy.ext.asyncio import AsyncSession, AsyncEngine, async_sessionmaker, create_async_engine

from app.core.config import settings


def _normalize_database_url(url: str) -> str:
    """
    Rewrite the DATABASE_URL scheme to use the asyncpg dialect.

    Most providers (Supabase, Heroku, etc.) supply URLs with ``postgresql://``
    or ``postgres://``, which SQLAlchemy resolves to the synchronous psycopg2
    driver.  Since this service uses ``create_async_engine`` with asyncpg, the
    scheme must be ``postgresql+asyncpg://``.
    """
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


def _build_engine() -> AsyncEngine | None:
    """
    Create the async SQLAlchemy engine only when DATABASE_URL is configured.
    Returns None during local health-check runs where no DB is needed yet.
    """
    if not settings.DATABASE_URL:
        return None
    return create_async_engine(
        _normalize_database_url(settings.DATABASE_URL),
        echo=settings.APP_ENV == "development",
        pool_size=5,
        max_overflow=10,
    )


engine = _build_engine()

async_session_factory = (
    async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    if engine is not None
    else None
)
