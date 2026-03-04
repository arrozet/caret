FROM python:3.12-slim

# Copy uv binary from the official image (avoids a full uv install)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install curl for Docker healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Disable uv cache to avoid home-directory writes at build time
ENV UV_NO_CACHE=1

# Install dependencies first to leverage Docker layer cache.
# --no-dev skips test/lint tools not needed at runtime.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# alembic.ini must be present at WORKDIR so that `alembic -c alembic.ini`
# resolves correctly when run via `docker compose exec`.
COPY alembic.ini ./
COPY app/ ./app/

# Make the venv readable by all users so the non-root runner can execute it
RUN chmod -R a+rX /app/.venv

# Run as non-root user for security.
# nobody's HOME=/nonexistent on Debian, so we bypass uv at runtime entirely
# by invoking uvicorn directly from the pre-built venv.
USER nobody

EXPOSE 8000

CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
