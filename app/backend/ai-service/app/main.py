from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI

from app.core.config import settings
from app.db.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """FastAPI lifespan: runs setup before the app starts and teardown on shutdown."""
    yield
    await engine.dispose()


app = FastAPI(
    title="Caret AI Service",
    version="0.1.0",
    description="Agentic AI inference, RAG pipeline, and SSE streaming for Caret.",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Routers will be included here as each feature is implemented:
# from app.routers import ai_router
# app.include_router(ai_router.router, prefix="/api/v1/ai", tags=["ai"])


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint used by ECS Fargate task health checks."""
    return {"status": "ok", "env": settings.APP_ENV}
