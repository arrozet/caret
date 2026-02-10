# Caret - Engineering Execution Roadmap

This roadmap outlines the step-by-step technical execution plan for building Caret, an agentic, AI-first document editor.

## 📦 Phase 1: The Skeleton (Setup & Auth)
*Goal: A deployable React app where users can sign in.*
- [ ] **Project Initialization**
    - [ ] Initialize Monorepo structure (Frontend + Backend folders).
    - [ ] Setup React + Vite + Tailwind CSS with the "Swiss Focus" theme tokens.
    - [ ] Configure Bun as the primary package manager.
- [ ] **Infrastructure Setup**
    - [ ] Initialize Supabase project (Auth, Database, Storage).
    - [ ] Setup environment variables management (.env) across services.
- [ ] **Authentication Flow**
    - [ ] Implement Supabase Auth integration in Frontend.
    - [ ] Build Login and Signup screens (Swiss Focus aesthetic).
    - [ ] Implement protected routes and session persistence.

## 💾 Phase 2: The Editor Core (CRUD)
*Goal: Users can write private documents that save to the DB.*
- [ ] **Tiptap Implementation**
    - [ ] Setup Tiptap Editor with core extensions (StarterKit, Typography).
    - [ ] Apply Swiss Focus typography overrides (Merriweather for content).
- [ ] **Database Schema**
    - [ ] Create `documents` table in Postgres (id, title, content, owner_id, timestamps).
    - [ ] Setup Row Level Security (RLS) policies in Supabase.
- [ ] **Document Service**
    - [ ] Build Node.js Document Service (Express/Fastify).
    - [ ] Implement `POST /documents` (Create) and `GET /documents` (List/Read).
    - [ ] Implement `PATCH /documents/:id` (Update) and `DELETE /documents/:id`.
- [ ] **Frontend Integration**
    - [ ] Connect Editor 'Save' state to API with auto-save debouncing.
    - [ ] Build Document Dashboard/List view.

## 🤝 Phase 3: Real-time Collaboration (The Hard Part)
*Goal: Multiple users can type in the same document via WebSockets.*
- [ ] **WebSocket Infrastructure**
    - [ ] Setup dedicated Node.js WebSocket Server (running on AWS ECS).
    - [ ] Configure Y.js backend for document synchronization.
- [ ] **Y.js Integration**
    - [ ] Integrate Y.js with Tiptap using `y-prosemirror`.
    - [ ] Setup `y-websocket` or `Hocuspocus` provider for real-time sync.
- [ ] **Presence & Awareness**
    - [ ] Implement Awareness protocol (Live cursor positions, User names/avatars).
    - [ ] Add "User Presence" indicators in the Top Bar.
- [ ] **Persistence Layer**
    - [ ] Implement Y.js update persistence to Postgres (Binary updates storage).
    - [ ] Build conflict-free document loading strategy.

## 🧠 Phase 4: The AI Brain (Agentic Service)
*Goal: The editor can "speak" to an LLM.*
- [ ] **AI Service Setup**
    - [ ] Setup Python/FastAPI Service with `uv`.
    - [ ] Integrate PydanticAI for agent orchestration.
- [ ] **Frontend AI UI**
    - [ ] Create "Caret AI Panel" (Vertical Sidebar) in Frontend.
    - [ ] Implement `Cmd+K` / `Ctrl+K` toggle logic.
- [ ] **Streaming Pipeline**
    - [ ] Implement Server-Sent Events (SSE) in FastAPI for real-time streaming.
    - [ ] Build Frontend SSE consumer with "Typing" animation.
- [ ] **Prompt Engineering**
    - [ ] Define system prompts for document enhancement and summarization.

## 🔍 Phase 5: Context & RAG
*Goal: The AI knows what you wrote.*
- [ ] **Vector Database**
    - [ ] Enable `pgvector` extension in Supabase/Postgres.
    - [ ] Create `document_sections` table for storing embeddings.
- [ ] **Embedding Pipeline**
    - [ ] Implement background chunking and embedding logic in Python.
    - [ ] Setup triggers to update embeddings when document content changes.
- [ ] **Contextual Retrieval**
    - [ ] Build semantic search queries for RAG.
    - [ ] Inject relevant document context into AI prompts.
- [ ] **Inline AI Features**
    - [ ] Implement "Ghost Text" (Copilot-style) inline suggestions.
    - [ ] Build "Diff View" for AI-proposed changes (Accept/Reject UI).

## 🚀 Phase 6: Production Polish
*Goal: Stability and Performance.*
- [ ] **Resilience**
    - [ ] Implement React Error Boundaries (Editor isolation).
    - [ ] Add offline-mode detection and sync-recovery.
- [ ] **UX Optimization**
    - [ ] Implement Optimistic UI updates for document actions.
    - [ ] Add skeleton screens and loading states.
- [ ] **Quality Assurance**
    - [ ] Setup Playwright for E2E testing of collaborative flows.
    - [ ] Perform accessibility audit (WCAG AA).
- [ ] **Deployment**
    - [ ] Deploy Frontend to Vercel.
    - [ ] Deploy Backend Services to AWS (Lambda for stateless, ECS for WebSockets).

## 🔮 Future Improvements (V2.0)
- **Redis Hot Cache**: Implement Redis for caching frequently accessed Y.js states and session data.
- **Async Task Queues**: Setup BullMQ/RabbitMQ for heavy document processing (PDF exports, bulk embeddings).
- **Model Router**: Intelligent routing between high-end (Gemini Pro) and fast (Gemini Flash) models.
- **Token Analytics**: Dashboard for monitoring LLM costs and usage patterns.
- **Offline-First**: Full local-first capabilities with periodic cloud sync.
