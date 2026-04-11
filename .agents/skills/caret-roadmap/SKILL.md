---
name: caret-roadmap
description: Caret engineering roadmap — execution phases, completed tasks, and pending work. Use when checking what has been built, what is next, what phase the project is in, or when planning new work in the Caret project.
---

# Caret Roadmap

**Status**: `[x]` Done · `[ ]` Pending · `[~]` Partial

## Phase 1 — Skeleton (Setup & Auth) ✅

- [x] Monorepo (Bun + uv), Docker Compose, testing frameworks
- [x] React + Vite + Tailwind "Swiss Focus" tokens
- [x] Supabase project (Auth + DB)
- [x] Login/Signup with Supabase Auth
- [x] API Gateway base routing + versioned paths `/api/v1/...`

## Phase 2 — Editor Core (CRUD) ✅

- [x] Tiptap Editor with Swiss Focus typography
- [x] Core DB tables: `workspaces`, `folders`, `documents` + RLS + indexes
- [x] Node.js Document Service (CRUD)
- [x] Editor autosave (debounced)
- [x] Formatting toolbar: bold, italic, underline, strike, headings, lists, blockquote, code, alignment, undo/redo
- [x] Document rename + delete with confirmation
- [x] Settings page (profile, language, theme)
- [x] Document Tabs (multi-document editing)
- [x] Context Menu on text selection (floating toolbar)

## Phase 3 — AI Brain (Agentic Service) ✅

- [x] Python/FastAPI service with PydanticAI (pydantic_ai 1.62.0)
- [x] `ai_conversations`, `ai_messages`, `ai_suggestions` tables + Alembic migration
- [x] "Caret AI Panel" UI + `Ctrl/Cmd+K` toggle
- [x] SSE streaming pipeline in AI Service (OpenRouter / OpenAI / Anthropic)
- [x] Frontend SSE consumer → chat message state (Tiptap integration deferred to Phase 4)

## Phase 4 — Context & RAG

- [ ] pgvector + `document_embeddings` table (chunk-level)
- [ ] HNSW index for vector similarity
- [ ] Embedding pipeline in Python (chunk → embed → store)
- [ ] Contextual retrieval for chat queries
- [ ] Ghost Text + inline suggestions UI

## Phase 5 — Real-time Collaboration
*Requires deployed infrastructure (ECS) to test end-to-end.*

- [ ] WebSocket Server on AWS ECS (Fargate)
- [ ] WebSocket JWT auth via query params
- [ ] Y.js + Tiptap + WebSocket provider integration
- [ ] Awareness (cursor positions, user names)
- [ ] `document_collab_updates` + `document_collab_snapshots` tables
- [ ] Periodic snapshot compaction job
- [ ] AI streaming + Y.js CRDT consistency test

## Phase 6 — Production Polish

- [ ] React Error Boundaries + offline detection
- [ ] Playwright E2E for critical flows
- [ ] Deploy Frontend (Vercel) + Backend (Lambda/ECS via SST)
- [ ] WCAG AA accessibility audit

## V2.0 Future

- Redis hot cache for frequently accessed documents
- BullMQ async task queues (PDF parsing, bulk embeddings)
- Intelligent model router (high-end vs fast LLMs)
