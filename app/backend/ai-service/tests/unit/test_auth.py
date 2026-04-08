"""
Unit tests for the JWT authentication module.

Verifies that get_current_user correctly rejects missing/expired/invalid tokens
and accepts well-formed tokens via JWKS verification — all without hitting real
Supabase endpoints.
"""

import time
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from core.auth import (
    AuthUser,
    _fetch_jwks,
    _get_jwks,
    _JwksCache,
    get_current_user,
)

# ---------------------------------------------------------------------------
# AuthUser dataclass
# ---------------------------------------------------------------------------


class TestAuthUser:
    """Validate the AuthUser dataclass.

    Ensures the dataclass stores user_id, email, and role correctly.
    """

    def test_auth_user_stores_fields(self) -> None:
        """AuthUser should store all fields passed to the constructor."""
        # Arrange
        user_id = str(uuid.uuid4())
        email = "user@example.com"
        role = "authenticated"

        # Act
        user = AuthUser(user_id=user_id, email=email, role=role)

        # Assert
        assert user.user_id == user_id
        assert user.email == email
        assert user.role == role

    def test_auth_user_email_can_be_none(self) -> None:
        """AuthUser.email should accept None (email not always present in JWT)."""
        # Arrange / Act
        user = AuthUser(user_id="uid-123", email=None, role="authenticated")

        # Assert
        assert user.email is None


# ---------------------------------------------------------------------------
# _fetch_jwks
# ---------------------------------------------------------------------------


class TestFetchJwks:
    """Test the JWKS fetching function.

    Verifies that it raises 503 when Supabase is not configured and handles
    HTTP errors from the upstream server.
    """

    @pytest.mark.asyncio
    async def test_raises_503_when_no_supabase_url(self) -> None:
        """_fetch_jwks should raise HTTPException 503 when SUPABASE_URL is not set."""
        # Arrange
        with patch("core.auth.settings") as mock_settings:
            mock_settings.SUPABASE_URL = ""
            mock_settings.SUPABASE_ANON_KEY = ""

            # Act / Assert
            with pytest.raises(HTTPException) as exc_info:
                await _fetch_jwks()

        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_raises_503_when_supabase_returns_non_200(self) -> None:
        """_fetch_jwks should raise HTTPException 503 when upstream returns an error status."""
        # Arrange
        mock_response = MagicMock()
        mock_response.status_code = 401

        with (
            patch("core.auth.settings") as mock_settings,
            patch("httpx.AsyncClient") as mock_client_cls,
        ):
            mock_settings.SUPABASE_URL = "https://project.supabase.co"
            mock_settings.SUPABASE_ANON_KEY = "anon-key"
            mock_client_instance = AsyncMock()
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client_instance

            # Act / Assert
            with pytest.raises(HTTPException) as exc_info:
                await _fetch_jwks()

        assert exc_info.value.status_code == 503

    @pytest.mark.asyncio
    async def test_returns_keys_on_success(self) -> None:
        """_fetch_jwks should return the 'keys' array from a successful JWKS response."""
        # Arrange
        fake_keys = [{"kty": "EC", "kid": "key-1"}]
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"keys": fake_keys}

        with (
            patch("core.auth.settings") as mock_settings,
            patch("httpx.AsyncClient") as mock_client_cls,
        ):
            mock_settings.SUPABASE_URL = "https://project.supabase.co"
            mock_settings.SUPABASE_ANON_KEY = "anon-key"
            mock_client_instance = AsyncMock()
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client_instance

            # Act
            result = await _fetch_jwks()

        # Assert
        assert result == fake_keys


# ---------------------------------------------------------------------------
# _get_jwks — caching
# ---------------------------------------------------------------------------


class TestGetJwksCache:
    """Test the JWKS caching logic.

    Verifies that the cache is used when valid and refreshed when the TTL expires.
    """

    @pytest.mark.asyncio
    async def test_returns_cached_keys_within_ttl(self) -> None:
        """_get_jwks should return cached keys without fetching when TTL has not elapsed."""
        # Arrange
        cached_keys = [{"kty": "EC", "kid": "cached"}]

        with patch("core.auth._jwks_cache") as _:
            import core.auth as auth_module

            auth_module._jwks_cache = _JwksCache(
                keys=cached_keys,
                fetched_at=time.monotonic(),  # fetched just now → within TTL
            )

            with patch("core.auth.settings") as mock_settings:
                mock_settings.JWKS_CACHE_TTL_SECONDS = 300

                # Act
                result = await _get_jwks()

        # Assert
        assert result == cached_keys

    @pytest.mark.asyncio
    async def test_refreshes_cache_when_ttl_expired(self) -> None:
        """_get_jwks should call _fetch_jwks when the cache TTL has elapsed."""
        # Arrange
        fresh_keys = [{"kty": "EC", "kid": "fresh"}]

        import core.auth as auth_module

        auth_module._jwks_cache = _JwksCache(
            keys=[{"kty": "EC", "kid": "stale"}],
            fetched_at=time.monotonic() - 10_000,  # fetched long ago → expired
        )

        with (
            patch("core.auth.settings") as mock_settings,
            patch("core.auth._fetch_jwks", new_callable=AsyncMock, return_value=fresh_keys),
        ):
            mock_settings.JWKS_CACHE_TTL_SECONDS = 300

            # Act
            result = await _get_jwks()

        # Assert
        assert result == fresh_keys


# ---------------------------------------------------------------------------
# get_current_user
# ---------------------------------------------------------------------------


class TestGetCurrentUser:
    """Test the FastAPI get_current_user dependency.

    Covers missing credentials, expired tokens, invalid signature, and a
    successful decode returning an AuthUser.
    """

    @pytest.mark.asyncio
    async def test_raises_401_when_no_credentials(self) -> None:
        """get_current_user should raise 401 when credentials are None."""
        # Arrange — pass None to simulate missing Authorization header

        # Act / Assert
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials=None)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_raises_401_when_credentials_empty(self) -> None:
        """get_current_user should raise 401 when Bearer token is an empty string."""
        # Arrange
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="")

        # Act / Assert
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials=creds)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_raises_401_on_expired_token(self) -> None:
        """get_current_user should raise 401 with 'expired' detail for expired tokens."""
        # Arrange
        from jose.exceptions import ExpiredSignatureError

        fake_keys = [{"kty": "EC", "kid": "k1"}]
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="expired.jwt.token")

        with (
            patch("core.auth._get_jwks", new_callable=AsyncMock, return_value=fake_keys),
            patch("core.auth.jwt.decode", side_effect=ExpiredSignatureError("expired")),
        ):
            # Act / Assert
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(credentials=creds)

        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_raises_401_on_all_keys_fail(self) -> None:
        """get_current_user should raise 401 when all JWKS keys fail to verify the token."""
        # Arrange
        from jose import JWTError

        fake_keys = [{"kty": "EC", "kid": "k1"}, {"kty": "EC", "kid": "k2"}]
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad.jwt.token")

        with (
            patch("core.auth._get_jwks", new_callable=AsyncMock, return_value=fake_keys),
            patch("core.auth.jwt.decode", side_effect=JWTError("bad sig")),
        ):
            # Act / Assert
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(credentials=creds)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_raises_401_when_sub_missing(self) -> None:
        """get_current_user should raise 401 when JWT payload has no 'sub' claim."""
        # Arrange
        fake_keys = [{"kty": "EC", "kid": "k1"}]
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid.jwt.token")
        # Payload without 'sub'
        fake_payload = {"email": "user@example.com", "role": "authenticated"}

        with (
            patch("core.auth._get_jwks", new_callable=AsyncMock, return_value=fake_keys),
            patch("core.auth.jwt.decode", return_value=fake_payload),
        ):
            # Act / Assert
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(credentials=creds)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_auth_user_on_valid_token(self) -> None:
        """get_current_user should return an AuthUser when the token is valid."""
        # Arrange
        user_id = str(uuid.uuid4())
        fake_keys = [{"kty": "EC", "kid": "k1"}]
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid.jwt.token")
        fake_payload = {
            "sub": user_id,
            "email": "user@example.com",
            "role": "authenticated",
        }

        with (
            patch("core.auth._get_jwks", new_callable=AsyncMock, return_value=fake_keys),
            patch("core.auth.jwt.decode", return_value=fake_payload),
        ):
            # Act
            result = await get_current_user(credentials=creds)

        # Assert
        assert isinstance(result, AuthUser)
        assert result.user_id == user_id
        assert result.email == "user@example.com"
        assert result.role == "authenticated"
