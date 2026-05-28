---
name: caret-backend
description: Caret backend - Express/TypeScript microservices, FastAPI AI service, API Gateway routing, OpenAPI/tsoa docs, AsyncAPI collaboration docs, Supabase JWT auth, REST/WebSocket/SSE protocols, RAG, and service-layer conventions. Use when building or modifying backend services, routes, controllers, repositories, DTOs, auth middleware, AI streaming, embeddings, or collaboration protocol code.
---

# Caret Backend

## Services

| Service | Stack | Port | Role |
|---|---|---:|---|
| `api-gateway` | Express 5 + TypeScript | 3000 | Public REST entrypoint, CORS, rate limiting, proxy routing |
| `auth-service` | Express 5 + TypeScript | 3001 | Auth metadata/docs and shared auth service skeleton |
| `document-service` | Express 5 + TypeScript + Drizzle | 3002 | Workspaces, folders, documents, document members, versions |
| `collab-service` | Node HTTP + `ws` + Y.js | 3003 | Direct WebSocket collaboration, awareness, AsyncAPI docs |
| `ai-service` | FastAPI + SQLAlchemy async + PydanticAI | 8000 | AI chat, suggestions, SSE streaming, embeddings/RAG |

Node services use **Bun**. The Python AI service uses **uv**.

## Public Routing

- Frontend HTTP calls go through the API Gateway at `/api/v1/...`.
- Gateway proxy routes:
  - `/api/v1/auth` -> `auth-service`
  - `/api/v1/documents`, `/api/v1/workspaces`, `/api/v1/folders` -> `document-service`
  - `/api/v1/ai` -> `ai-service`
- Collaboration is the direct exception: frontend connects to `ws.caret.page` or local `ws://localhost:3003/document/{doc_id}?token={jwt}`.
- Do not route collaboration WebSockets through the API Gateway.

## API Documentation

- `api-gateway`, `auth-service`, and `document-service` use `tsoa spec`.
- Their `tsoa.json` files point to `src/app.ts` and `src/controllers/*_controller.ts`.
- Generated OpenAPI specs live under `src/openapi/swagger.json`.
- Runtime docs are mounted as `/openapi.json` and `/docs`.
- In current Node services, many controllers are metadata controllers for OpenAPI; runtime HTTP handling is Express routes/proxies.
- `collab-service` uses AsyncAPI instead of tsoa and exposes `/asyncapi.json` and `/docs`.
- `ai-service` uses FastAPI's native docs at `/openapi.json`, `/docs`, and `/redoc`.

## Architecture Rules

Keep the existing layer split unless a service already proves otherwise:

```text
route/controller/handler -> service -> repository -> db/model/schema
```

- Route/controller/handler: parse HTTP or WebSocket boundary, validate inputs, call services.
- Service: business rules, protocol orchestration, mapping.
- Repository: all SQL/ORM access; no HTTP/WebSocket concepts.
- DTO/schema/model: typed shapes only.
- Do not import Drizzle or SQLAlchemy directly into route handlers.
- Prefer constructor injection/manual wiring already used in `document-service` and `collab-service`.

## Node Service Shape

```text
service/src/
  app.ts
  controllers/       # tsoa metadata controllers where present
  routes/            # Express runtime routes where present
  handlers/          # WebSocket/protocol handlers, mainly collab-service
  services/
  repositories/
  db/
  dtos/
  models/
  middleware/
  lib/
  openapi/ or asyncapi/
```

Common scripts:

```text
bun run dev
bun run build
bun run test:unit
bun run test:integration
bun run lint
bun run format:check
```

Use `bun run openapi:generate` for services with tsoa. Use Drizzle commands only in services that define them.

## AI Service Shape

```text
ai-service/src/
  main.py
  routers/
  services/
  repositories/
  models/
  schemas/
  db/
  core/
  agents/
```

- Routers expose `/ai/...` endpoints.
- `ai_router.py` owns conversations/messages and SSE chat streaming.
- `embedding_router.py` owns `/ai/embeddings/index`, `/ai/embeddings/search`, and deletion.
- `suggestion_router.py` owns suggestion lifecycle.
- `EmbeddingService` stores/searches `document_embeddings` with pgvector.
- `AIAgentService` injects RAG context through `search_workspace_context`.

## Protocols

| Protocol | Path | Notes |
|---|---|---|
| REST JSON | `/api/v1/...` | Stateless CRUD and AI non-streaming endpoints through gateway |
| SSE | `POST /ai/conversations/{conversation_id}/stream` behind gateway | AI token streaming |
| WebSocket | `/document/{doc_id}?token={jwt}` on collab service | Y.js sync and awareness |

## Service Notes

- `auth-service` is currently runtime-minimal: health, docs, and error middleware are mounted; auth controller files mainly provide OpenAPI metadata.
- `document-service` is the real CRUD service for workspaces, folders, documents, sharing, and versions.
- `ai-service` is implemented beyond a stub: models, conversations, suggestions, embeddings, SSE streaming, and model-provider selection exist.
- RAG is materially implemented but should degrade gracefully when embeddings are missing.
- `collab-service` keeps empty rooms in memory so brief disconnects do not immediately lose in-memory `Y.Doc` state.

AI consistency rule:

1. AI streams text to the frontend.
2. Frontend applies chunks/suggestions through editor state.
3. Tiptap/Y.js propagates collaborative state.
4. AI service does not directly mutate document content tables.

## Collaboration Status

- `collab-service` validates Supabase JWTs during WebSocket handshake.
- It implements Y.js sync message type `0` and awareness message type `1`.
- It has repositories for `document_collab_updates` and `document_collab_snapshots`.
- Persistence is partially wired: updates and periodic snapshots can be saved when `DATABASE_URL` exists, but room creation still starts from a fresh `Y.Doc` and does not yet restore with `CollabPersistenceService.loadDocument`.
- When fixing collaboration persistence, load the stored Y.js state before sending initial sync step 1.

## Auth And Config

- Services validate Supabase JWTs using Supabase config and JWKS where applicable.
- Keep secrets in environment variables. Never commit keys.
- Important env vars include `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `JWT_SECRET`, LLM provider keys, and service URLs.
