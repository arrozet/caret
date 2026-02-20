# Caret - Engineering Execution Roadmap

This roadmap outlines the strict step-by-step technical execution plan for building Caret. Every task refers to its source of truth in the documentation hub.

## 📦 Phase 1: The Skeleton (Setup & Auth)
*Goal: A deployable React app where users can sign in.*
- [ ] Initialize Monorepo structure (Frontend + Backend folders) using **Bun** and **uv**. (See **[DEPLOYMENT.md](./DEPLOYMENT.md)**)
- [ ] Setup Docker Compose for local development environment. (See **[DEPLOYMENT.md](./DEPLOYMENT.md)**)
- [ ] Setup testing frameworks: Vitest (Node/React) and Pytest (Python). (See **[TESTING.md](./TESTING.md)**)
- [ ] Setup React + Vite + Tailwind with "Swiss Focus" tokens. (See **[FRONTEND.md](./FRONTEND.md)**)
- [ ] Setup Supabase Project (Auth + Database). (See **[DATABASE.md](./DATABASE.md)**)
- [ ] Implement Login/Signup screens with Supabase Auth. (See **[FRONTEND.md](./FRONTEND.md)**)
- [ ] Implement API Gateway base routing + versioned paths (`/api/v1/...`). (See **[BACKEND.md](./BACKEND.md)**)

## 💾 Phase 2: The Editor Core (CRUD)
*Goal: Users can write private documents that save to the DB.*
- [ ] Implement Tiptap Editor with Swiss Focus typography overrides. (See **[FRONTEND.md](./FRONTEND.md)**)
- [ ] Create core tables: `workspaces`, `folders`, and `documents` + RLS policies. (See **[DATABASE.md](./DATABASE.md)**)
- [ ] Create performance indexes for core tables. (See **[DATABASE.md](./DATABASE.md)**)
- [ ] Build Node.js Document Service: CRUD operations. (See **[BACKEND.md](./BACKEND.md)**)
- [ ] Connect Editor 'Save' state to API with debouncing. (See **[FRONTEND.md](./FRONTEND.md)**)

## 🤝 Phase 3: Real-time Collaboration
*Goal: Multiple users can type in the same document via WebSockets.*
- [ ] Setup dedicated Node.js WebSocket Server on AWS ECS (Fargate). (See **[DEPLOYMENT.md](./DEPLOYMENT.md)**)
- [ ] Implement WebSocket JWT Authentication via query params. (See **[BACKEND.md](./BACKEND.md)**)
- [ ] Integrate Y.js with Tiptap and WebSocket provider. (See **[BACKEND.md](./BACKEND.md)**)
- [ ] Implement Awareness (Cursor positions, User names). (See **[FRONTEND.md](./FRONTEND.md)**)
- [ ] Create `document_collab_updates` + `document_collab_snapshots` tables and implement Snapshot + Update Log strategy. (See **[DATABASE.md](./DATABASE.md)**)
- [ ] Build periodic snapshot compaction job. (See **[DATABASE.md](./DATABASE.md)**)

## 🧠 Phase 4: The AI Brain (Agentic Service)
*Goal: The editor can "speak" to an LLM.*
- [ ] Setup Python/FastAPI Service with PydanticAI. (See **[BACKEND.md](./BACKEND.md)**)
- [ ] Create `ai_conversations`, `ai_messages`, and `ai_suggestions` tables. (See **[DATABASE.md](./DATABASE.md)**)
- [ ] Create "Caret AI Panel" UI and `Cmd+K` toggle. (See **[FRONTEND.md](./FRONTEND.md)**)
- [ ] Implement Streaming Response (SSE) pipeline in AI Service. (See **[BACKEND.md](./BACKEND.md)**)
- [ ] Build Frontend SSE consumer that applies chunks as Tiptap Transactions. (See **[BACKEND.md](./BACKEND.md)**)
- [ ] Test AI streaming with Y.js to ensure CRDT consistency. (See **[TESTING.md](./TESTING.md)**)

## 🔍 Phase 5: Context & RAG
*Goal: The AI knows what you wrote.*
- [ ] Enable `pgvector` and create `document_embeddings` table (chunk-level embeddings). (See **[DATABASE.md](./DATABASE.md)**)
- [ ] Create HNSW index for vector similarity search. (See **[DATABASE.md](./DATABASE.md)**)
- [ ] Create Embedding Pipeline in Python to chunk documents. (See **[BACKEND.md](./BACKEND.md)**)
- [ ] Implement Contextual Retrieval for chat queries. (See **[BACKEND.md](./BACKEND.md)**)
- [ ] Add "Ghost Text" and Inline Suggestions UI. (See **[FRONTEND.md](./FRONTEND.md)**)

## 🚀 Phase 6: Production Polish
*Goal: Stability and Performance.*
- [ ] Implement React Error Boundaries and offline detection. (See **[FRONTEND.md](./FRONTEND.md)**)
- [ ] Setup Playwright for E2E testing of critical flows. (See **[TESTING.md](./TESTING.md)**)
- [ ] Deploy Frontend to Vercel and Backend (Lambda/ECS) via SST. (See **[DEPLOYMENT.md](./DEPLOYMENT.md)**)
- [ ] Perform Accessibility Audit (WCAG AA). (See **[FRONTEND.md](./FRONTEND.md)**)

## 🔮 Future Improvements (V2.0)
- **Redis Hot Cache**: For frequently accessed documents. (See **[BACKEND.md](./BACKEND.md)**)
- **Async Task Queues**: For heavy document processing. (See **[BACKEND.md](./BACKEND.md)**)
- **Model Router**: Intelligent LLM selection. (See **[BACKEND.md](./BACKEND.md)**)
