# Caret - Agentic AI-First Document Editor

## Introduction

You are an expert software engineer and AI specialist. Your goal is to implement **Caret**, an agentic, AI-first document editor for collaborative and structured writing. Caret integrates true agentic capabilities into a rich document editor, allowing AI to understand, modify, and enhance documents intelligently.

## Architecture

### Architectural Patterns
- **Frontend**: Clean Architecture (decoupling UI, domain logic, and data sources).
- **Backend**: Microservices-based architecture (independent services for Core/Collaboration and AI).

### Technology Stack

**Frontend**
- React (TypeScript)
- Vite (build tool)
- TailwindCSS (styling)
- FontAwesome (icons)
- Tiptap (rich text editor framework)
- Bun (package manager)

**Core Services**
- Node.js (Core & Real-time collaboration)
- Y.js (CRDT for shared editing)
- Bun (package manager & runtime)

**Agentic AI (Python)**
- FastAPI (API framework)
- Pydantic (data validation & typing)
- PydanticAI (agentic framework)
- uv (package manager)

**Infrastructure & Database**
- Supabase (PostgreSQL, Auth, Storage)
- pgvector (vector search/embeddings)
- Frontend Deployment: Vercel
- Backend Core (WebSockets): AWS ECS (Persistent for Y.js)
- Backend AI: AWS Lambda (Serverless for Agentic AI)
- Development Environment: Docker & Docker Compose for local orchestration

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│                  Tiptap + TailwindCSS + TypeScript              │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌─────────────┐  ┌──────────────────┐
│ Real-time    │  │ Document    │  │ Agentic AI       │
│ Collab       │  │ Management  │  │ Integration      │
│ (Y.js)       │  │ (Node.js)   │  │ (Python)         │
└──────┬───────┘  └──────┬──────┘  └────────┬─────────┘
       │                 │                  │
       └─────────────────┼──────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ PostgreSQL   │  │ pgvector     │  │ Cache/Queue  │
│ (Supabase)   │  │ (Embeddings) │  │ (Redis)      │
└──────────────┘  └──────────────┘  └──────────────┘
```

## Core Features (MVP)

### Phase 1: Foundation
1. **Rich Text Editor** - Tiptap-based document editing with formatting
2. **Basic Authentication** - Supabase auth integration
3. **Document Management** - Create, save, retrieve documents
4. **Real-time Collaboration** - Y.js for multi-user editing

### Phase 2: Agentic AI
1. **AI Writing Assistant** - Content generation and enhancement
2. **Context Awareness** - Document understanding and RAG
3. **Smart Suggestions** - AI-powered recommendations
4. **Batch Processing** - Async handling of large document uploads/analysis

### Phase 3: Optimization
1. **Model Routing** - Automatic LLM selection for cost optimization
2. **Caching Layer** - Redis for real-time collaboration performance
3. **Async Task Queue** - Background processing for heavy operations
4. **Vector Search** - Advanced RAG with pgvector

## Known Challenges & Future Improvements

### Technical Challenges
1. **Rich Text Editor Implementation** - Building on solid foundations (Tiptap/ProseMirror)
2. **Real-time Sync** - Managing concurrent edits and collaboration at scale
3. **AI Integration** - Ensuring agentic capabilities enhance rather than distract
4. **Cost Optimization** - Managing LLM API costs efficiently

### Planned Enhancements
1. Redis caching for real-time collaboration performance
2. Automatic model routing based on task complexity
3. Async task queue (Bull/RabbitMQ) for heavy document processing
4. Advanced RAG with vector search
5. Offline-first capabilities
6. Team workspaces and permissions
