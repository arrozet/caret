# Collab Service

Collaboration service for real-time document sync using WebSocket + Y.js CRDT. It validates Supabase JWT on handshake and keeps collaborative state synchronized per document room.

## Local Contract (Frozen)

- Local WebSocket URL: `ws://localhost:3003/document/{doc_id}?token={jwt}`
- Production target URL: `wss://collab.caret.page/document/{doc_id}?token={jwt}`

## Endpoints and Port

- Port: `3003`
- Health check: `GET /health` (example: `http://localhost:3003/health`)
- WebSocket route: `GET /document/{doc_id}?token={jwt}` (upgrade to WebSocket)

## Required Environment Variables (minimum)

- `PORT` (default `3003`)
- `DATABASE_URL`
- `SUPABASE_JWT_SECRET` (for HS256 tokens)
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` (for JWKS validation of ES256/RS256 tokens)

## Run Locally

From the repository root:

```bash
docker compose up --build collab-service
```

Follow logs:

```bash
docker compose logs -f collab-service
```

Alternative (without Docker), from `app/backend/collab-service`:

```bash
bun run dev
```

## Deployment Note

Target runtime in cloud is AWS ECS Fargate (stateful, always-on WebSocket service) managed via SST. This does not block local development, which runs independently with Docker Compose.
