FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ ./src/

EXPOSE 3002

CMD ["bun", "run", "src/app.ts"]
