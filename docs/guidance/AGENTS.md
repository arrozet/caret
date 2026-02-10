# Caret - Agentic AI-First Document Editor

## Introduction

You are an expert software engineer and AI specialist. Your goal is to implement **Caret**, an agentic, AI-first document editor for collaborative and structured writing. Caret integrates true agentic capabilities into a rich document editor, allowing AI to understand, modify, and enhance documents intelligently.

## Architecture

### Architectural Patterns
- **Frontend**: Clean Architecture (decoupling UI, domain logic, and data sources).
- **Backend**: Microservices-based architecture (independent services for Core/Collaboration and AI).

### Backend Microservices

**API Gateway**
- **Responsibility**: Single entry point for all client requests.
- **Key Features**:
  - Request routing to appropriate microservices.
  - Authentication and authorization validation.
  - Rate limiting and request throttling.
  - CORS handling and security policies.
- **Deployment**: AWS Lambda (Node.js with Serverless Framework or SST).

**Auth Service (Node.js)**
- **Responsibility**: User authentication and authorization.
- **Key Features**:
  - User registration, login, and session management.
  - Integration with Supabase Auth.
  - JWT token generation and validation.
  - Role-based access control (RBAC).
- **Deployment**: AWS Lambda (serverless, stateless).

**Document Service (Node.js)**
- **Responsibility**: Document lifecycle management.
- **Key Features**:
  - Document CRUD operations (Create, Read, Update, Delete).
  - Document metadata and versioning.
  - Integration with PostgreSQL for persistent storage.
  - Document permissions and sharing.
- **Deployment**: AWS Lambda (serverless, stateless).

**Collaboration Service (Y.js/Node.js)**
- **Responsibility**: CRDT-based real-time synchronization.
- **Key Features**:
  - WebSocket server for persistent connections.
  - Y.js CRDT document state management.
  - Conflict-free collaborative editing.
  - Awareness protocol for cursor positions and user presence.
- **Deployment**: AWS ECS (dedicated service, requires persistent state and long-lived connections).

**AI Service (Python/FastAPI)**
- **Responsibility**: Agentic AI inference and document intelligence.
- **Key Features**:
  - Integration with PydanticAI for agent orchestration.
  - Context-aware text generation and enhancement.
  - RAG (Retrieval-Augmented Generation) using pgvector.
  - LLM inference with streaming support.
- **Deployment**: AWS Lambda (serverless, stateless operations).

### Technology Stack

**Frontend**
- React (TypeScript)
- Vite (build tool)
- TailwindCSS (styling)
- FontAwesome (icons)
- Tiptap (rich text editor framework)
- react-i18next (internationalization)
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

**Database & Storage**
- PostgreSQL (Supabase - primary database)
- pgvector (vector embeddings for RAG)
- Supabase Storage (file attachments)
- Supabase Auth (authentication provider)

**Cloud Infrastructure**
- **Vercel**: Frontend hosting (React/Vite static assets)
- **AWS Lambda**: Serverless functions for API Gateway, Auth Service, Document Service, AI Service
- **AWS ECS (Fargate)**: Containerized Collaboration Service (persistent WebSocket connections)
- **Serverless Framework / SST**: Infrastructure-as-Code for Lambda deployment

**Development Environment**
- Docker & Docker Compose (local orchestration of all microservices)

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

## Frontend Design Philosophy

**"Swiss Focus"** - Rigorous, grid-based, minimal interface. Content comes first; UI is secondary. The aesthetic mimics high-end digital paper.

### Key Principles
- **Triadic Color Identity**: 
  - Deep blue (`#0066CC`) for primary UI - the familiar tool environment
  - Purple (`#8B5CF6`) exclusively for AI features - the assistant's domain
  - International Orange (`#FF4500`) for the Caret - the user's active focus
- **Typography**: UI in Inter/Geist Sans; Document in Merriweather/Newsreader (serif)
- **Mobile-First**: Responsive design from 320px to 1440px+
- **Internationalization**: Primary language is English, with multi-language support (es, fr, de, pt)
- **Accessibility**: WCAG AA compliant with full keyboard navigation
- **Dark Mode**: System-aware theme with manual toggle persistence

### Core Components
- **Document Editor**: Tiptap-based, max-width 800px for optimal readability
- **Caret AI Panel**: Collapsible right sidebar (400px), triggered by `Cmd+K`
- **Real-time Collab**: Live cursors, user avatars, edit indicators
- **Glassmorphism**: Subtle translucent overlays for modals and panels

📐 **Complete Design System**: See [FRONTEND.md](./FRONTEND.md) for full specifications (color palette, typography scale, grid system, component architecture, animations, and accessibility guidelines).


## Core Features (MVP)

### Phase 1: Foundation (MVP without AI)
Focus: Core editor functionality and real-time collaboration.

1. **Rich Text Editor** - Tiptap-based document editing with formatting (bold, italic, headings, lists, etc.).
2. **Basic Authentication** - Supabase auth integration (sign up, login, session management).
3. **Document Management** - Create, save, retrieve, and delete documents with PostgreSQL persistence.
4. **Real-time Collaboration** - Y.js CRDT-based multi-user editing with WebSocket synchronization.

**Deliverable**: A fully functional collaborative document editor without AI capabilities.

### Phase 2: Agentic Integration (MVP with AI)
Focus: AI-powered writing assistance and intelligent document features.

1. **AI Writing Assistant** - Content generation, rewriting, and text enhancement using LLMs.
2. **Context Awareness (RAG)** - Document understanding using pgvector for semantic search and context retrieval.
3. **Smart Suggestions** - AI-powered recommendations for style, tone, and structure improvements.
4. **Streaming Responses** - Real-time AI output using Server-Sent Events (SSE) for responsive UX.

**Deliverable**: A complete agentic document editor with intelligent writing assistance.

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

## Future Improvements (Architecture v2.0)

### Performance & Scalability
1. **Redis Hot Cache** - Implement Redis for caching frequently accessed documents and Y.js state.
2. **BullMQ Task Queue** - Async processing for heavy operations (PDF parsing, bulk embeddings generation).
3. **Connection Pooling** - Optimize database connections for high-concurrency scenarios.

### AI Optimization
1. **Model Router** - Intelligent routing between "Smart" models (Gemini 3 Pro) for complex tasks and "Fast" models (Gemini 3 Flash) for simple operations.
2. **Streaming with SSE** - Server-Sent Events for real-time AI response streaming to improve perceived performance.
3. **Token Usage Analytics** - Monitor and optimize LLM API costs with detailed metrics.

### Developer Experience
1. **OpenAPI Documentation** - Auto-generated API docs for all backend services.
2. **E2E Testing** - Comprehensive testing for collaborative editing and AI features.
3. **CI/CD Pipelines** - Automated deployment to AWS ECS and Lambda.
