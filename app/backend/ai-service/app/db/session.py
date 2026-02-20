from sqlalchemy.ext.asyncio import AsyncSession, AsyncEngine, async_sessionmaker, create_async_engine

from app.core.config import settings


def _build_engine() -> AsyncEngine | None:
    """
    Create the async SQLAlchemy engine only when DATABASE_URL is configured.
    Returns None during local health-check runs where no DB is needed yet.
    """
    if not settings.DATABASE_URL:
        return None
    return create_async_engine(
        settings.DATABASE_URL,
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
