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
- **Authentication Strategy**: Supabase JWT is passed via WebSocket connection URL as a query parameter (`wss://collab.caret.page/document/{doc_id}?token=<jwt>`). The server validates the token during the WebSocket handshake before allowing CRDT synchronization.

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
- **URL Pattern**: All services are exposed through the API Gateway under a single prefix: `/api/v1/{resource}`. The Gateway routes by path (e.g. `/api/v1/auth/*`, `/api/v1/documents/*`, `/api/v1/ai/*`) to the corresponding microservice.
- **Frontend contract**: The frontend **always** calls the API Gateway only, using the URL pattern `/api/v{version}/{service}/*` (e.g. `/api/v1/auth/login`, `/api/v1/documents`, `/api/v1/ai/stream`). It never calls Auth, Document, or AI services directly. The only exception is the Collaboration Service (WebSocket), which the frontend connects to separately because it is not HTTP.
- **Future Versions**: Breaking changes will be introduced in new versions (v2, v3, etc.) while maintaining backward compatibility for previous versions when possible.

### REST API Design Principles
All REST endpoints must follow these principles:

- **Naming**: Use **nouns** for resources (e.g. `/documents`, `/users`), not verbs. Use **plural** for collection URLs. Prefer **kebab-case** for multi-word segments. Use HTTP **methods** (GET, POST, PUT, PATCH, DELETE) to express the action.
- **Idempotency**: **GET**, **PUT**, and **DELETE** must be idempotent (same request, same effect; safe to retry). **POST** for creation is non-idempotent by default; for critical operations (e.g. payments, duplicate-sensitive creates), support an **Idempotency-Key** header and treat repeated requests with the same key as one operation.
- **Safety**: **GET** must be safe (no side effects on server state). Do not use GET for mutations.
- **Status codes**: Use standard HTTP status codes (200, 201, 204, 400, 401, 403, 404, 409, 422, 500) consistently. Return **201 Created** with `Location` header for new resources; **204 No Content** for successful DELETE or update-with-no-body.
- **Statelessness**: Each request must carry enough context (e.g. auth token); the server must not rely on session state stored between requests for correctness.
- **One resource, one endpoint**: Do not multiply endpoints for the same logical operation with different filters or criteria. For example, do **not** create separate routes like “search by name”, “search by surname”, “search by date”. Use **one** resource (e.g. `GET /api/v1/documents` or `GET /api/v1/users`) and pass optional **query parameters** (e.g. `?name=...&surname=...&createdAfter=...`). The server interprets the combination of params; clients can send any subset. Same idea for sorting: one endpoint with `?sort=field&order=asc|desc` rather than many “sort by X” endpoints.

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
- **Documentation Endpoint**: `/api/v1/docs` at API Gateway - interactive Swagger UI for the unified public API contract.
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
   wss://collab.caret.page/document/{doc_id}?token={jwt}
  ```
- The Collaboration Service validates the token before accepting the connection.
- Invalid tokens result in immediate connection closure (401 Unauthorized).

## Internal Service Architecture (Layered Structure)

Every microservice follows the same 4-layer internal architecture. The goal is strict separation of concerns: each layer has one responsibility and one only. Violating these boundaries is a code review blocker.

### The 4-Layer Model

```
┌─────────────────────────────────────────────────┐
│  Controller (HTTP boundary)                     │
│  • Parses HTTP request                          │
│  • Validates input DTO                          │
│  • Calls Service                                │
│  • Returns HTTP response with output DTO        │
│  Rule: NO business logic. NO SQL.               │
├─────────────────────────────────────────────────┤
│  Service (Business logic)                       │
│  • Orchestrates Repositories                    │
│  • Enforces domain rules                        │
│  • Maps DTOs → Models and Models → DTOs         │
│  Rule: NO HTTP concepts (req/res). NO SQL.      │
├─────────────────────────────────────────────────┤
│  Repository (Data access)                       │
│  • All ORM/SQL queries live here                │
│  • Receives and returns domain Models           │
│  • One repository per domain aggregate          │
│  Rule: NO business logic. Returns Models only.  │
├─────────────────────────────────────────────────┤
│  Model / Schema (Domain & API shapes)           │
│  • Domain Models: internal data representations │
│  • DTOs: validated API input/output types       │
│  Rule: DTOs never reach the Repository.         │
│  Rule: Models are never serialized directly.    │
└─────────────────────────────────────────────────┘
```

### Layer Rules Summary

| Layer | Can import | Cannot import |
|:------|:-----------|:--------------|
| Controller | DTOs, Service | Repository, ORM, Models |
| Service | Repository, Models, DTOs (for mapping) | ORM directly, HTTP types |
| Repository | ORM (Drizzle / SQLAlchemy), Models | Service, DTOs, HTTP types |
| DTO / Model | (pure types, no imports) | Any layer |

### Key Patterns

- **DTO (Data Transfer Object)**: Define explicit input/output types for every API endpoint. DTOs are validated at the HTTP boundary (Controller layer). They must never be passed down to the Repository layer — map them to domain Models at the Service layer.
- **Repository Pattern**: All database queries live in Repository classes. Services never import the ORM directly. This makes the DB layer swappable and unit-testable in isolation.
- **ORM**: Use **Drizzle ORM** for Node.js services (type-safe, SQL-first, minimal overhead for Lambda). Use **SQLAlchemy** (async) for the Python AI service.
- **Dependency Injection**: Services receive their Repositories as constructor arguments (not imports). This enables clean unit testing with mocked repositories.

### Data Flow

```
HTTP Request
    │
    ▼
Controller          ← validates InputDTO (e.g. CreateDocumentDto)
    │ calls service(input_dto)
    ▼
Service             ← maps InputDTO → Model, applies business rules
    │ calls repository.create(model)
    ▼
Repository          ← executes SQL via ORM, returns Model
    │ returns Model
    ▼
Service             ← maps Model → OutputDTO
    │ returns output_dto
    ▼
Controller          ← sends HTTP 201 with OutputDTO as JSON body
```

---

## Directory Structure per Service

### Node.js Services (Auth, Document, Collaboration)

**Tech**: Express + tsoa + Drizzle ORM + TypeScript

```
service-name/
├── src/
│   ├── controllers/        # tsoa: @Route, @Get, @Post decorators
│   │   └── document_controller.ts
│   ├── services/           # Business logic; receives repos via DI
│   │   └── document_service.ts
│   ├── repositories/       # All Drizzle ORM queries
│   │   └── document_repository.ts
│   ├── models/             # Domain entity types (internal)
│   │   └── document_model.ts
│   ├── dtos/               # Input/output API shapes (validated by tsoa)
│   │   ├── create_document_dto.ts
│   │   └── document_response_dto.ts
│   ├── db/                 # Drizzle ORM config, schema definitions, migrations
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── migrations/
│   ├── lib/                # Shared utilities: logger, error classes, constants
│   │   ├── errors.ts
│   │   └── logger.ts
│   ├── middleware/         # Express middleware: auth guards, error handler, rate limit
│   │   ├── auth_middleware.ts
│   │   └── error_middleware.ts
│   └── app.ts              # Express app setup + tsoa route registration
├── tests/
│   ├── unit/               # Service and Repository unit tests (mocked dependencies)
│   └── integration/        # Full HTTP endpoint tests (test DB)
├── package.json
└── tsconfig.json
```

**Dependency injection rule**: Services are instantiated in `app.ts` (or a DI container). Repositories are injected into Services via constructor. Services are injected into Controllers via tsoa's DI mechanism. Nothing is imported directly inside business logic files.

---

### Python AI Service (FastAPI + SQLAlchemy)

**Tech**: FastAPI + SQLAlchemy async + Pydantic + PydanticAI + uv

```
ai-service/
├── app/
│   ├── routers/            # FastAPI routers (equivalent of controllers)
│   │   └── ai_router.py
│   ├── services/           # Business logic; PydanticAI agent orchestration
│   │   └── ai_service.py
│   ├── repositories/       # All SQLAlchemy queries; returns domain models
│   │   └── conversation_repository.py
│   ├── models/             # SQLAlchemy ORM table definitions (DB layer)
│   │   └── conversation_model.py
│   ├── schemas/            # Pydantic schemas = DTOs (API input/output validation)
│   │   ├── ai_request.py
│   │   └── ai_response.py
│   ├── db/                 # SQLAlchemy async engine, session factory
│   │   ├── session.py
│   │   └── migrations/     # Alembic migration files
│   ├── core/               # Settings (pydantic-settings), startup lifespan, DI
│   │   ├── config.py
│   │   └── dependencies.py # FastAPI Depends() factories
│   └── main.py             # FastAPI app instantiation + router registration
├── tests/
│   ├── unit/               # Service and repository unit tests
│   └── integration/        # API endpoint tests (HTTPX + async test DB)
├── pyproject.toml
└── uv.lock
```

**Pydantic schemas as DTOs**: In FastAPI, Pydantic `BaseModel` subclasses serve as DTOs. They are declared as request/response types in the router, validated automatically by FastAPI, and must be mapped to SQLAlchemy Models before being passed to the Repository.

**SQLAlchemy vs Pydantic models**: These are two distinct types and must never be mixed.
- `app/models/` = SQLAlchemy ORM classes (represent DB tables, used only in Repositories).
- `app/schemas/` = Pydantic classes (represent API data shapes, used only in Routers and Services for mapping).

---

## Communication Protocols

| Protocol | Direction | Services Involved | Use Case |
|:---------|:----------|:-----------------|:---------|
| **REST (HTTP/JSON)** | Frontend → Gateway → Service | Auth, Document, AI (via Gateway) | All stateless CRUD and request/response operations |
| **WebSocket** | Frontend ↔ Collaboration Service | Collaboration Service (ECS) | Y.js CRDT real-time sync; persistent bidirectional connection |
| **SSE (Server-Sent Events)** | AI Service → Frontend | AI Service (ECS) | Token-by-token LLM streaming; unidirectional server push |

### REST

All REST endpoints are exposed exclusively through the **API Gateway**. The frontend never calls individual services directly. Versioning prefix: `/api/v1/`.

### WebSocket

The Collaboration Service runs as a persistent WebSocket server on ECS (not Lambda, due to connection statefulness). Authentication is performed at handshake time via JWT query param:

```
wss://collab.caret.page/document/{doc_id}?token={supabase_jwt}
```

### SSE (AI Streaming)

The AI Service pushes token chunks to the frontend via SSE. The frontend applies each chunk as a **Tiptap transaction**, which propagates through Y.js automatically to maintain CRDT consistency. The AI Service **never** writes to the database directly.

```
POST /api/v1/ai/stream
    │
    ▼  (SSE stream opens)
AI Service → chunk → Frontend → Tiptap transaction → Y.js update → all collaborators
```

---

## Future Improvements (v2.0)
- **Redis Hot Cache**: For caching frequently accessed documents and Y.js state.
- **BullMQ Task Queue**: Async processing for heavy operations (PDF parsing, bulk embeddings).
- **Model Router**: Intelligent routing between high-end and fast LLMs.
