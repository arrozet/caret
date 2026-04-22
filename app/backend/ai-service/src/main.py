from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from db.session import engine
from routers.ai_router import completion_router as ai_completion_router
from routers.ai_router import meta_router as ai_meta_router
from routers.ai_router import router as ai_router
from routers.embedding_router import router as embedding_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """FastAPI lifespan: runs setup before the app starts and teardown on shutdown."""
    yield
    if engine is not None:
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

# ---------------------------------------------------------------------------
# CORS — the API Gateway is the only upstream caller in production, but allow
# the Vite dev server origin during local development.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(ai_router, prefix="/ai", tags=["ai"])
app.include_router(ai_meta_router, prefix="/ai", tags=["ai"])
app.include_router(ai_completion_router, prefix="/ai", tags=["ai"])
app.include_router(embedding_router, prefix="/ai", tags=["embeddings"])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint used by ECS Fargate task health checks."""
    return {"status": "ok", "env": settings.app_env}
