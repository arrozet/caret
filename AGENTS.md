# Caret - Agentic AI-First Document Editor

## Vision

Caret is an agentic, AI-first document editor for collaborative and structured writing. It addresses a critical gap in the market: while agentic IDEs like Cursor and Copilot have transformed code writing, document editing remains stagnant.

Current solutions (Word's Copilot, Google Docs' Gemini) offer limited agentic capabilities—they're essentially chat toggles with minimal document interaction. Caret aims to change this by providing true agentic capabilities integrated into a rich document editor where AI can understand, modify, and enhance documents intelligently.

## Problem Statement

As a student and writer, I've encountered a key problem: **document writing is not as "agile" as code writing with modern AI tools**. No major company is effectively integrating AI into Word/Google Docs-like editors with genuine agentic capabilities.

### Why Caret is Viable

1. **Less explored market**: Only lex.pages has achieved relative success with a similar concept, with limited visibility
2. **Lower token costs**: Modifying documents is significantly cheaper than generating code (fewer tokens)
3. **High utility**: Essential for students, professionals, and anyone writing structured documents
4. **Monetization potential**: Clear paths for premium features, API access, and enterprise solutions

## Architecture

### Technology Stack

**Frontend**
- React (TypeScript)
- Vite (build tool)
- TailwindCSS (styling)
- Tiptap (rich text editor framework)

**Core Services**
- Node.js service for real-time collaboration (Y.js) and core document functionality
- PostgreSQL database (via Supabase)

**Agentic AI**
- Python service (LangGraph or PydanticAI - TBD)
- LLM routing for cost optimization
- Vector embeddings with pgvector for RAG capabilities

**Infrastructure**
- Supabase (auth, PostgreSQL, storage)
- Real-time collaboration with Y.js

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

## Project Name

**Caret** (^) - The caret symbol indicates cursor position where text will be inserted. It's:
- Concise and memorable
- Related to document writing and editing
- Not widely known, making it distinctive
- Technically meaningful for our use case

## Development Approach

This is a thesis project (TFG) that aims to:
1. Prove the viability of agentic document editors
2. Create a functional MVP with genuine AI integration
3. Establish a foundation for future development
4. Contribute to an underexplored market

The scope is carefully bounded to deliver a working prototype while remaining realistic for thesis completion timeframe.

## References & Inspiration

- **Cursor** / **Copilot** - Agentic code editors (inspiration for UX/workflow)
- **Lex.pages** - Existing agentic document editor (limited visibility)
- **Tiptap** - Rich text editor framework
- **ProseMirror** - Underlying editor technology
- **Y.js** - Real-time collaboration library
- **Supabase** - Backend-as-a-service platform
