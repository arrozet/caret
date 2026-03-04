"""
JWT authentication dependency for the AI Service.

Mirrors the TypeScript auth_middleware in the document-service:
  - Fetches the JWKS from Supabase GoTrue (with local caching)
  - Verifies the Bearer token using jose (ES256)
  - Attaches the decoded payload to the request via FastAPI Depends()

Usage:
    from app.core.auth import get_current_user, AuthUser

    @router.post("/conversations")
    async def create_conversation(
        body: ConversationCreate,
        user: AuthUser = Depends(get_current_user),
    ) -> ConversationResponse:
        ...
"""

import time
from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

from app.core.config import settings

# ---------------------------------------------------------------------------
# Bearer token extractor
# ---------------------------------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# JWKS cache
# ---------------------------------------------------------------------------


@dataclass
class _JwksCache:
    """In-process JWKS cache entry."""

    keys: list[dict]  # type: ignore[type-arg]
    fetched_at: float  # Unix timestamp


_jwks_cache: _JwksCache | None = None


async def _fetch_jwks() -> list[dict]:  # type: ignore[type-arg]
    """
    Download the public JWKS from the Supabase GoTrue endpoint.

    The ``apikey`` header is required by Supabase's GoTrue v2 for all
    well-known endpoints; httpx.AsyncClient is used for async I/O.

    Returns:
        List of JWK objects.

    Raises:
        HTTPException 503 if the JWKS cannot be fetched.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured (missing SUPABASE_URL / SUPABASE_ANON_KEY).",
        )

    base = settings.SUPABASE_URL.rstrip("/")
    url = f"{base}/auth/v1/.well-known/jwks.json"

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url, headers={"apikey": settings.SUPABASE_ANON_KEY})

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to fetch JWKS from Supabase: HTTP {response.status_code}",
        )

    data = response.json()
    return data.get("keys", [])


async def _get_jwks() -> list[dict]:  # type: ignore[type-arg]
    """
    Return the cached JWKS keys, refreshing if the TTL has elapsed.

    Returns:
        List of JWK objects (at least one key expected).
    """
    global _jwks_cache

    now = time.monotonic()
    if (
        _jwks_cache is not None
        and now - _jwks_cache.fetched_at < settings.JWKS_CACHE_TTL_SECONDS
    ):
        return _jwks_cache.keys

    keys = await _fetch_jwks()
    _jwks_cache = _JwksCache(keys=keys, fetched_at=now)
    return keys


# ---------------------------------------------------------------------------
# Authenticated user payload
# ---------------------------------------------------------------------------


@dataclass
class AuthUser:
    """
    Decoded Supabase JWT payload attached to the request context.

    Attributes:
        user_id: Supabase user UUID (``sub`` claim).
        email: User email from the JWT (optional).
        role: Supabase role string (typically ``"authenticated"``).
    """

    user_id: str
    email: str | None
    role: str


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthUser:
    """
    FastAPI dependency that validates the Bearer JWT and returns the caller.

    Raises:
        HTTPException 401 if the token is missing, expired, or invalid.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    keys = await _get_jwks()

    for jwk in keys:
        try:
            payload = jwt.decode(
                token,
                jwk,
                algorithms=["ES256", "RS256"],
                options={"verify_aud": False},
            )
            user_id: str = payload.get("sub", "")
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token missing subject claim.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return AuthUser(
                user_id=user_id,
                email=payload.get("email"),
                role=payload.get("role", ""),
            )
        except ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except JWTError:
            # Try next key if JWKS has multiple entries
            continue

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid token signature.",
        headers={"WWW-Authenticate": "Bearer"},
    )
