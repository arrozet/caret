---
name: caret-backend
description: Caret backend — microservices architecture, REST API design, 4-layer internal structure, WebSocket/SSE protocols, and Node.js/Python service conventions. Use when building or modifying any backend service, API endpoint, controller, service layer, repository, DTO, or when working with the AI streaming or collaboration protocol.
---

# Caret Backend

## Services Overview

| Service | Stack | Deploy | Role |
|---|---|---|---|
| API Gateway | Node.js + TS | AWS Lambda (SST) | Single entry point, routing, auth, rate limiting |
| Auth Service | Node.js + TS | AWS Lambda | JWT, Supabase Auth, RBAC |
| Document Service | Node.js + TS | AWS Lambda | Document CRUD, versioning, permissions |
| Collaboration Service | Node.js + Y.js | AWS ECS Fargate | WebSocket, CRDT sync, presence |
| AI Service | Python + FastAPI | AWS ECS Fargate | PydanticAI, RAG, SSE streaming |

- **Frontend calls**: API Gateway only at `/api/v1/...` — never individual services directly.
- **Exception**: Collaboration Service (WebSocket) is called directly: `wss://collab.caret.page/document/{id}?token={jwt}`

## API Design Rules

- Nouns for resources, plural, kebab-case: `GET /api/v1/documents`, not `getDocuments`
- One endpoint per resource + query params: `GET /api/v1/documents?sort=updated_at&order=desc`
- Status codes: `200` OK · `201` Created (+ `Location` header) · `204` No Content · `400/401/403/404/409/422/500`
- GET/PUT/DELETE must be idempotent · GET must be safe (no side effects)
- All requests stateless (auth token in each request)

## 4-Layer Internal Architecture (all services)

```
Controller   ← HTTP boundary: parse request, validate InputDTO, call Service, return OutputDTO
    ↓          Rule: NO business logic. NO SQL.
Service      ← Business logic: map DTO→Model, enforce rules, call Repository
    ↓          Rule: NO HTTP concepts. NO SQL.
Repository   ← All ORM/SQL queries; receives and returns domain Models
    ↓          Rule: NO business logic. Returns Models only.
Model/DTO    ← Domain Models (internal) + DTOs (API input/output)
               Rule: DTOs never reach Repository. Models never serialized directly.
```

### Import rules

| Layer | Can import | Cannot import |
|---|---|---|
| Controller | DTOs, Service | Repository, ORM, Models |
| Service | Repository, Models, DTOs (for mapping) | ORM directly, HTTP types |
| Repository | ORM (Drizzle/SQLAlchemy), Models | Service, DTOs, HTTP types |
| DTO/Model | (pure types) | Any layer |

## Node.js Service Structure

```
service-name/src/
├── controllers/   # tsoa: @Route, @Get, @Post decorators
├── services/      # Business logic; repos injected via constructor
├── repositories/  # All Drizzle ORM queries
├── models/        # Domain entity types (internal)
├── dtos/          # Input/output API shapes (validated by tsoa)
├── db/            # Drizzle schema, client, migrations/
├── lib/           # logger, error classes, constants
├── middleware/    # auth_middleware.ts, error_middleware.ts
└── app.ts         # Express setup + tsoa route registration
```

**DI rule**: Repos injected into Services via constructor. Services injected into Controllers via tsoa DI. Never import inside business logic.

## Python AI Service Structure

```
ai-service/app/
├── routers/       # FastAPI routers (equivalent of controllers)
├── services/      # PydanticAI agent orchestration
├── repositories/  # All SQLAlchemy queries; returns domain models
├── models/        # SQLAlchemy ORM table definitions (DB layer only)
├── schemas/       # Pydantic BaseModel = DTOs (API input/output)
├── db/            # async engine, session factory, Alembic migrations
├── core/          # config (pydantic-settings), lifespan, FastAPI Depends()
└── main.py        # app instantiation + router registration
```

**Key rule**: `app/models/` = SQLAlchemy ORM (DB layer only). `app/schemas/` = Pydantic (API layer only). Never mix them.

## Critical Protocols

### AI → Editor (Data Consistency)
1. AI Service streams text via **SSE** to Frontend
2. Frontend applies each chunk as a **Tiptap Transaction**
3. Tiptap → Y.js update → all collaborators in sync
4. AI Service **never** writes to DB or modifies document state directly

### WebSocket Auth (Collaboration)
```
wss://collab.caret.page/document/{doc_id}?token={supabase_jwt}
```
Server validates JWT at handshake. Invalid token → immediate close (403).

## Communication Protocols

| Protocol | Direction | Use case |
|---|---|---|
| REST (HTTP/JSON) | Frontend → Gateway → Service | All stateless CRUD |
| WebSocket | Frontend ↔ Collaboration | Y.js CRDT real-time sync |
| SSE | AI Service → Frontend | Token-by-token LLM streaming |

## Package Managers

- Node.js services: **Bun** only
- Python AI Service: **uv** only
