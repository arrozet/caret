---
name: caret-roadmap
description: Caret engineering roadmap - current project status, completed phases, partial work, pending backend/frontend/database/collaboration/AI/deployment tasks, and next-step planning. Use when checking what has been built, what remains, what phase the project is in, or when planning new work in the Caret project.
---

# Caret Roadmap

Status markers: `[x]` done, `[~]` partially done, `[ ]` pending.

## Current Snapshot

- Core editor, auth, document CRUD, workspaces, folders, sharing, settings, and document tabs are implemented.
- AI service, AI panel, conversations/messages/suggestions, SSE streaming, embeddings, and RAG search are implemented in code.
- Real-time collaboration code exists across frontend and backend, including WebSocket service, Y.js sync, awareness UI, and persistence tables.
- Collaboration persistence is partial: updates/snapshots can be written, but room startup does not yet restore persisted Y.js state.
- Production deployment has moved to Hetzner VPS + Coolify + Docker Compose, with Supabase Cloud for PostgreSQL/Auth/pgvector.
- GitHub Actions are intended for CI/CD, but no workflow files are currently checked into `.github/workflows`.

## Phase 1 - Skeleton And Auth

- [x] Monorepo with frontend and backend service folders.
- [x] Bun for frontend and Node services.
- [x] uv for Python AI service.
- [x] Docker Compose local development.
- [x] React/Vite/Tailwind frontend foundation.
- [x] Supabase Auth and cloud PostgreSQL.
- [x] Supabase profile flow through `user_profiles`.
- [x] API Gateway base routing under `/api/v1`.

## Phase 2 - Editor Core

- [x] Tiptap editor.
- [x] Swiss Focus visual system in current frontend CSS.
- [x] Workspaces, folders, documents, document members, and document versions.
- [x] RLS policies for core document tables.
- [x] Document service repositories, services, routes, and OpenAPI metadata.
- [x] Document list and editor routes: `/documents`, `/documents/:id`.
- [x] Autosave and document update flows.
- [x] Formatting toolbar and editor utilities.
- [x] Document rename/delete/move/share flows.
- [x] Settings page.
- [x] Document tabs.

## Phase 3 - AI Brain

- [x] FastAPI AI service with PydanticAI dependencies.
- [x] SQLAlchemy async + Alembic AI tables.
- [x] `ai_conversations`, `ai_messages`, `ai_suggestions`.
- [x] `tool_calls` support on AI messages.
- [x] AI assistant panel and frontend API client.
- [x] SSE streaming endpoint and frontend stream consumer.
- [x] OpenRouter/OpenAI/Anthropic-oriented provider config.

## Phase 4 - Context And RAG

- [x] `document_embeddings` table with pgvector.
- [x] HNSW vector index and workspace-scoped embedding migration.
- [x] Python embedding service for chunking, embedding, replacing, searching, and deleting chunks.
- [x] Embedding router endpoints under `/ai/embeddings`.
- [x] Agent-side `search_workspace_context` dependency.
- [x] Frontend triggers embedding indexing from editor save flow.
- [~] Ghost text and inline suggestion editor extensions exist, but validate product completeness before calling this phase done.
- [~] RAG is implemented in code, but needs production data verification and quality evaluation.

## Phase 5 - Real-Time Collaboration

- [x] `collab-service` WebSocket server on port 3003.
- [x] Direct WebSocket endpoint `/document/{doc_id}?token={jwt}`.
- [x] Supabase JWT validation on handshake.
- [x] Y.js sync protocol and awareness protocol handling.
- [x] Frontend collaboration client, hooks, presence components, and dev harness.
- [x] AsyncAPI docs for collaboration service.
- [x] `document_collab_updates` and `document_collab_snapshots` tables.
- [x] Persistence repositories and snapshot scheduler.
- [~] Persistence write path is wired when `DATABASE_URL` exists.
- [ ] Restore persisted Y.js state when creating/loading a room.
- [ ] Add regression test for room restart/load-from-DB behavior.
- [ ] Validate production WebSocket behavior through `ws.caret.page`.

## Phase 6 - Production And Quality

- [x] Production Docker Compose file exists.
- [x] Hetzner VPS + Coolify deployment target documented.
- [x] Cloudflare DNS/domain plan documented for `caret.page`, `api.caret.page`, `ws.caret.page`, and `ops.caret.page`.
- [~] GitHub Actions CI/CD is intended, but workflow files are not present in repo.
- [~] Unit/integration tests exist across frontend, Node services, and AI service.
- [ ] Add/commit GitHub Actions workflow files if CI should be reproducible from repo.
- [ ] Add Playwright E2E smoke coverage if required.
- [ ] Run a WCAG/accessibility pass on critical screens.
- [ ] Add production smoke tests for frontend, gateway, auth, CRUD, AI, and WebSocket collaboration.

## Current High-Value Next Steps

- Wire `collab-service` room creation to `CollabPersistenceService.loadDocument`.
- Add an integration test proving collaboration state survives room/server restart.
- Add GitHub Actions workflows for lint, build/type checks, unit tests, integration tests, and Coolify deploy from `prod`.
- Verify production environment variables for `api.caret.page`, `ws.caret.page`, Supabase, and LLM providers.
- Evaluate RAG quality with real document data and adjust chunking/retrieval thresholds.

## Future

- Redis or another hot cache only if profiling shows repeated document or collaboration bottlenecks.
- Async queues for heavy background jobs such as bulk embeddings or document import/export.
- Smarter model routing between fast and high-quality LLMs.
- More robust document import/export workflows.
