from collections.abc import AsyncGenerator

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import async_session_factory


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides an async SQLAlchemy session per request.
    Inject via: session: AsyncSession = Depends(get_db_session)

    Raises 503 if DATABASE_URL is not configured (e.g. during local dev without DB).
    """
    if async_session_factory is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
