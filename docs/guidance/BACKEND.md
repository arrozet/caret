# Caret - Backend Architecture & API Specifications

## Architectural Patterns
- **Microservices**: Independent services for Core/Collaboration and AI.
- **Node.js (Core)**: Handles document management, authentication, and real-time sync.
- **Python (AI)**: Handles agentic AI, LLM orchestration, and RAG.
- **Communication**: REST APIs for stateless operations, WebSockets for real-time sync, SSE for AI streaming.

## Microservices Breakdown

### 1. API Gateway
- **Responsibility**: Single entry point for all client requests.
- **Key Features**:
  - Request routing to appropriate microservices.
  - Authentication and authorization validation.
  - Rate limiting and request throttling.
  - CORS handling and security policies.
- **Tech Stack**: Node.js / AWS Lambda.

### 2. Auth Service (Node.js)
- **Responsibility**: User authentication and authorization.
- **Key Features**:
  - Integration with Supabase Auth.
  - JWT token generation and validation.
  - Role-based access control (RBAC).

### 3. Document Service (Node.js)
- **Responsibility**: Document lifecycle management.
- **Key Features**:
  - Document CRUD operations.
  - Document metadata and versioning.
  - Integration with PostgreSQL for persistent storage.
  - Document permissions and sharing.

### 4. Collaboration Service (Y.js/Node.js)
- **Responsibility**: CRDT-based real-time synchronization.
- **Key Features**:
  - WebSocket server for persistent connections.
  - Y.js CRDT document state management.
  - Conflict-free collaborative editing.
  - Awareness protocol for cursor positions and user presence.
- **Tech Stack**: Node.js / AWS ECS (Fargate).
- **Authentication Strategy**: Supabase JWT is passed via WebSocket connection URL as a query parameter (`wss://collab.caret.app?token=<jwt>`). The server validates the token during the WebSocket handshake before allowing CRDT synchronization.

### 5. AI Service (Python/FastAPI)
- **Responsibility**: Agentic AI inference and document intelligence.
- **Key Features**:
  - Integration with **PydanticAI** for agent orchestration.
  - Context-aware text generation and enhancement.
  - RAG (Retrieval-Augmented Generation) using pgvector.
  - LLM inference with streaming support (SSE).
- **Tech Stack**: Python / FastAPI / uv.

## Critical Integration Protocols

### AI-to-Editor Protocol (Data Consistency)
**Problem**: The AI Service generates text, but direct overwrites would conflict with Y.js CRDT synchronization.

**Solution**:
1. The AI Service streams text via **Server-Sent Events (SSE)** to the Frontend.
2. The Frontend receives each chunk and applies it as a **Tiptap Transaction**.
3. Tiptap Transactions trigger Y.js updates automatically, ensuring CRDT consistency.
4. The AI Service **never** writes directly to the database or modifies the document state.

**Implementation**:
```typescript
// Frontend: Consuming AI Stream
const applyAIStream = (chunk: string) => {
  editor.chain().insertContent(chunk).run();
  // This triggers Y.js sync automatically
};
```

### WebSocket Authentication (Collaboration Service)
**Problem**: Standard HTTP headers are limited in WebSocket connections.

**Solution**:
- The Frontend passes the Supabase JWT as a **query parameter** during the WebSocket handshake:
  ```
  wss://collab.caret.app/document/{docId}?token={jwt}
  ```
- The Collaboration Service validates the token before accepting the connection.
- Invalid tokens result in immediate connection closure (403 Unauthorized).

## API Specifications (Draft)

### Document CRUD
- `GET /documents`: List user documents.
- `POST /documents`: Create a new document.
- `GET /documents/:id`: Retrieve document metadata and content.
- `PATCH /documents/:id`: Update document metadata/content.
- `DELETE /documents/:id`: Delete a document.

### AI Endpoints
- `POST /ai/chat`: Send a message to Caret (AI Assistant). Returns SSE stream.
- `POST /ai/suggest`: Get inline ghost text suggestions.
- `POST /ai/enhance`: Request specific document enhancements (rewrite, summarize).

## Future Improvements (v2.0)
- **Redis Hot Cache**: For caching frequently accessed documents and Y.js state.
- **BullMQ Task Queue**: Async processing for heavy operations (PDF parsing, bulk embeddings).
- **Model Router**: Intelligent routing between high-end and fast LLMs.
