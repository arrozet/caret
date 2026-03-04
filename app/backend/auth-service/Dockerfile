FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ ./src/

# Run as non-root user for security
USER bun

EXPOSE 3001

CMD ["bun", "run", "src/app.ts"]
