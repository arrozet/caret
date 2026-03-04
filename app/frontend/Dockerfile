FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 5173

# vite.config.ts already sets server.host: true, so the dev server
# accepts connections from outside the container on 0.0.0.0
CMD ["bun", "run", "dev"]
