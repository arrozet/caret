# Caret - Backend Architecture & API Specifications

## Architectural Patterns
- **Microservices**: Independent services for Core/Collaboration and AI.
- **Node.js + TypeScript (Core)**: Handles document management, authentication, and real-time sync.
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
- **Tech Stack**: Node.js + TypeScript / AWS Lambda.
- **Deployment**: AWS Lambda via **SST** (Serverless Stack). TypeScript-native infra-as-code; single `sst.config.ts` for functions, API routes, and AWS resources.

### 2. Auth Service (Node.js + TypeScript)
- **Responsibility**: User authentication and authorization.
- **Key Features**:
  - User registration, login, and session management.
  - Integration with Supabase Auth.
  - JWT token generation and validation.
  - Role-based access control (RBAC).
- **Deployment**: AWS Lambda (serverless, stateless).

### 3. Document Service (Node.js + TypeScript)
- **Responsibility**: Document lifecycle management.
- **Key Features**:
  - Document CRUD operations.
  - Document metadata and versioning.
  - Integration with PostgreSQL for persistent storage.
  - Document permissions and sharing.
- **Deployment**: AWS Lambda (serverless, stateless).

### 4. Collaboration Service (Y.js/Node.js + TypeScript)
- **Responsibility**: CRDT-based real-time synchronization.
- **Key Features**:
  - WebSocket server for persistent connections.
  - Y.js CRDT document state management.
  - Conflict-free collaborative editing.
  - Awareness protocol for cursor positions and user presence.
- **Tech Stack**: Node.js + TypeScript + Y.js.
- **Deployment**: AWS ECS (Fargate).
- **Authentication Strategy**: Supabase JWT is passed via WebSocket connection URL as a query parameter (`wss://collab.caret.page?token=<jwt>`). The server validates the token during the WebSocket handshake before allowing CRDT synchronization.

### 5. AI Service (Python/FastAPI)
- **Responsibility**: Agentic AI inference and document intelligence.
- **Key Features**:
  - Integration with **PydanticAI** for agent orchestration.
  - Context-aware text generation and enhancement.
  - RAG (Retrieval-Augmented Generation) using pgvector.
  - LLM inference with streaming support (SSE).
- **Tech Stack**: Python / FastAPI / uv.
- **Deployment**: AWS ECS (Fargate). Always-on container to support long-lived SSE streaming, RAG queries, and agentic workflows without Lambda timeouts or cold starts.

## API Versioning & Documentation

### API Versioning
- **Version Strategy**: All APIs will implement versioning from the start.
- **Current Version**: v1 (first version).
- **URL Pattern**: All services are exposed through the API Gateway under a single prefix: `/api/v1/{resource}`. The Gateway routes by path (e.g. `/api/v1/auth/*`, `/api/v1/documents/*`, `/api/v1/ai/*`) to the corresponding microservice. The frontend only calls `/api/v1/...`.
- **Future Versions**: Breaking changes will be introduced in new versions (v2, v3, etc.) while maintaining backward compatibility for previous versions when possible.

### OpenAPI Documentation

- **Per-service specs**: Each microservice (Auth, Document, Collaboration, AI) must expose its own OpenAPI specification (e.g. `/openapi.json` or equivalent).
- **Aggregation at the Gateway**: The API Gateway must aggregate or proxy these specs so that a single, unified documentation endpoint is available. The frontend consumes the API only through the Gateway; therefore the Gateway is the single source of truth for the public API contract and its docs (e.g. `/api/v1/docs` serving the merged or linked OpenAPI definition).

#### AI Service (Python/FastAPI)
- **Auto-generated Documentation**: FastAPI provides automatic OpenAPI (Swagger) documentation out of the box.
- **Endpoints**:
  - `/docs` - Interactive Swagger UI
  - `/redoc` - ReDoc alternative documentation interface
  - `/openapi.json` - Raw OpenAPI specification
- **Features**: Automatic schema generation from Pydantic models, interactive API testing, and type validation.

#### Node.js Services (Document, Auth, Collaboration)
- **Tech Stack**: Node.js + TypeScript + Express
- **Library**: **tsoa** (TypeScript OpenAPI API) + **swagger-ui-express**
- **Key Features**:
  - Automatic OpenAPI specification generation from TypeScript decorators and interfaces
  - Type-safe route definitions with compile-time validation
  - Automatic request/response validation using TypeScript types
  - Controllers and routes generated from decorators (@Route, @Get, @Post, etc.)
- **Documentation Endpoint**: `/api/v1/docs` - Interactive Swagger UI for all Node.js services.
- **Implementation**: TypeScript decorators on controllers and interfaces for request/response models will automatically generate the complete OpenAPI specification.

## Critical Integration Protocols

### AI-to-Editor Protocol (Data Consistency)
**Problem**: The AI Service generates text, but direct overwrites would conflict with Y.js CRDT synchronization.

**Solution**:
1. The AI Service streams text via **Server-Sent Events (SSE)** to the Frontend.
2. The Frontend receives each chunk and applies it as a **Tiptap Transaction**.
3. Tiptap Transactions trigger Y.js updates automatically, ensuring CRDT consistency.
4. The AI Service **never** writes directly to the database or modifies the document state.

### WebSocket Authentication (Collaboration Service)
**Problem**: Standard HTTP headers are limited in WebSocket connections.

**Solution**:
- The Frontend passes the Supabase JWT as a **query parameter** during the WebSocket handshake:
  ```
  wss://collab.caret.page/document/{docId}?token={jwt}
  ```
- The Collaboration Service validates the token before accepting the connection.
- Invalid tokens result in immediate connection closure (403 Unauthorized).

## Future Improvements (v2.0)
- **Redis Hot Cache**: For caching frequently accessed documents and Y.js state.
- **BullMQ Task Queue**: Async processing for heavy operations (PDF parsing, bulk embeddings).
- **Model Router**: Intelligent routing between high-end and fast LLMs.
