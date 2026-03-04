FROM oven/bun:1-alpine

WORKDIR /app

# Install dependencies first to leverage Docker layer cache
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ ./src/

# Run as non-root user for security
USER bun

EXPOSE 3000

# Bun runs TypeScript natively — no build step required
CMD ["bun", "run", "src/app.ts"]
