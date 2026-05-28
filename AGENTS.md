# Caret - System Documentation Hub

## Introduction

You are an expert software engineer and AI specialist. Your goal is to implement **Caret**, an agentic, AI-first document editor for collaborative and structured writing. Caret integrates true agentic capabilities into a rich document editor, allowing AI to understand, modify, and enhance documents intelligently.

## Vision & Problem Statement

### Vision

Caret addresses a critical gap in the market: while agentic IDEs like Cursor and Copilot have transformed code writing, document editing remains stagnant. Current solutions offer limited agentic capabilities: they are essentially chat toggles with minimal document interaction. Caret aims to change this by providing true agentic capabilities integrated into a rich document editor.

### Problem Statement

Document writing is not as agile as code writing with modern AI tools. No major company is effectively integrating AI into Word/Google Docs-like editors with genuine agentic capabilities.

## What's in a Name?

**Caret** (^) indicates the cursor position where text will be inserted. It was chosen because it is:

- Concise and memorable.
- Directly related to document writing and editing.
- Technically meaningful yet distinctive.

## Development Guidelines

### Code Agent Execution Guidelines

These guidelines exist to **finish sooner**, **preserve useful context**, and **avoid expensive exploration**.

#### Subagent orchestration (parallel / sequential)

- **Divide and conquer**: delegate scoped tasks (targeted search, small file reads, validation, command execution) to subagents.
- **Run in parallel when possible**: if tasks are independent (for example locating files, checking docs, and symbol lookup), spawn subagents concurrently to reduce wall-clock time.
- **Run sequentially when dependent**: if a task depends on another task's output (for example "find the correct file" then "edit it"), chain subagents in sequence.
- **Protect the primary context window**: keep high-level requirements, decisions, and risks in the main agent, and offload mechanical work to subagents so the primary context stays clean and focused.

#### Default rule: avoid reading the whole codebase

- **Do not perform full-repo scans** unless strictly necessary.
- **Prefer fast sources of truth first**:
  - `.agents/skills/*` for recommended procedures and patterns. Load the relevant skill first when one applies.
  - Files directly referenced by the user (paths like `@...`) or pointed to by the loaded skill.
- **Avoid old long-form guidance docs by default**: they are stale and too large. Open one only if the user explicitly asks for that exact file.
- **Explore the minimum necessary**: start with the most likely directory and narrow quickly; avoid opening large files just in case.

### Design Principles

- **Design Patterns**: Prioritize the use of established design patterns to create a scalable, extensible, and maintainable codebase.
- **SOLID Principles**: Apply SOLID principles consistently:
  - **S**ingle Responsibility Principle
  - **O**pen/Closed Principle
  - **L**iskov Substitution Principle
  - **I**nterface Segregation Principle
  - **D**ependency Inversion Principle
- **Best Practices**: Apply concrete programming best practices including:
  - **Error Handling**: Implement comprehensive error handling with proper exception management and user-friendly error messages.
  - **Input Validation**: Validate all inputs at API boundaries and user interfaces to prevent security vulnerabilities and data corruption.
  - **Type Safety**: Leverage TypeScript/Python type systems fully; avoid `any` types and use strict type checking.
  - **Code Reusability**: Extract common functionality into reusable utilities, hooks, and services to avoid code duplication.
  - **Performance**: Optimize for performance (lazy loading, memoization, efficient queries, caching strategies).
  - **Security**: Follow security best practices (authentication, authorization, input sanitization, SQL injection prevention, XSS protection).
  - **Testing**: Write unit tests for critical business logic and integration tests for API endpoints.
  - **Version Control**: Follow these practices:
    - **Conventional Commits**: Use the [Conventional Commits](https://www.conventionalcommits.org/) standard. Prefix messages with a type such as `feat`, `fix`, `docs`, `style`, `refactor`, `test`, or `chore`, for example `feat(editor): add bold formatting` or `fix(auth): resolve session expiry`.
    - **Incremental commits**: Make small, focused commits rather than large ones. This makes it easier to locate regressions, revert changes, and review code; avoid committing many unrelated changes in a single commit.
    - **Branches**: Use a dedicated branch for each significant change (feature, fix, or refactor). Create branches from the main line, work in isolation, and merge back via pull/merge requests so changes are traceable and reviewable.
  - **Code Review**: Ensure all code changes are reviewed before merging to maintain quality standards.

### Code Style & Naming Conventions

Naming conventions vary by technology to follow each ecosystem's best practices.

#### Frontend (React/TypeScript)

Naming conventions in React are based on readability and structure:

- **Components**: Use `PascalCase` for all React components (for example `MyComponent.tsx`, `EditorPage.tsx`).
- **Functions, Variables, and Properties**: Use `camelCase` for functions, variables, and properties (for example `userData`, `onClick`, `isVisible`).
- **React Hooks**: Use `camelCase` starting with `use` (for example `useAuth`, `useDocument`, `useSaveDocument`).
- **Event Handlers**: Prefix with `handle` using `camelCase` (for example `handleClick`, `handleSubmit`, `handleUserInput`).
- **Constants**: Use `UPPER_SNAKE_CASE` for constants (for example `MAX_FILE_SIZE`, `API_BASE_URL`).
- **Local pattern override**: follow the existing feature's filenames and exports when they differ from older docs. Current stores/hooks commonly use camelCase filenames.

#### Backend - Node.js Services

- **Variables, Functions, and Methods**: Use `camelCase` for variables, functions, methods, and instances (for example `userAction`, `getUserById`, `documentRepository`).
- **Classes and Constructors**: Use `PascalCase` for classes and constructors (for example `UserManager`, `DocumentService`, `CollaborationController`).
- **Files**: Use `snake_case` for backend service file names in lowercase with underscores separating words (for example `user_repository.ts`, `document_routes.ts`).
- **Local compatibility aliases**: preserve existing compatibility exports where a file already exposes both camelCase and snake_case APIs.

#### Backend - Python Services (AI Service with FastAPI)

- **Variables, Functions, and Methods**: Use `snake_case` for variables, functions, and methods (for example `user_id`, `create_user`, `get_all_items`).
- **Classes and Models**: Use `PascalCase` for Python classes, including Pydantic models and SQLAlchemy models (for example `UserCreate`, `ItemResponse`, `AIAgentService`).
- **Files**: Use `snake_case` for Python module names (for example `ai_router.py`, `document_repository.py`, `config.py`).

#### General Rules

- **Consistency**: Maintain consistent naming conventions within each part of the codebase.
- **Clarity**: Choose descriptive names that clearly convey purpose and intent.
- **Avoid Abbreviations**: Use full words unless the abbreviation is universally understood (for example `id`, `url`, `api`).

### Documentation Standards

- **Docstrings**: All functions and classes must include docstrings written in English, regardless of whether they are in the frontend or backend codebase.
- **Code Comments**: Code should be clearly and correctly commented in English. Add explanatory comments for:
  - Technical or complex logic.
  - Specific implementation details.
  - Unclear or non-obvious code sections.
  - Algorithm explanations and design decisions.
- **Purpose**: Documentation should help developers understand the more technical, specific, or unclear parts of the codebase.

## High-Level Architecture

### Tech Stack Overview

**Frontend**

- React 19 + TypeScript.
- Vite.
- TailwindCSS v4 with the Swiss Focus theme.
- Tiptap 3 / ProseMirror.
- Y.js collaboration integration.
- TanStack Query for server state.
- Zustand for auth, theme, AI panel, and editor tabs.
- Supabase JS for auth and `user_profiles`.
- Lucide React icons.
- react-i18next internationalization.
- Bun package manager.

**Backend**

- `api-gateway`: Node.js + TypeScript + Express, public REST gateway.
- `auth-service`: Node.js + TypeScript + Express, currently runtime-minimal auth/docs service.
- `document-service`: Node.js + TypeScript + Express + Drizzle, workspaces/folders/documents CRUD.
- `collab-service`: Node.js + TypeScript + `ws` + Y.js, direct WebSocket collaboration.
- `ai-service`: Python + FastAPI + PydanticAI + SQLAlchemy async + Alembic.
- Bun for Node services and uv for the Python AI service.

**Database & Storage**

- Supabase Cloud PostgreSQL.
- Supabase Auth.
- pgvector for RAG embeddings.
- Drizzle migrations for Node service schemas.
- Alembic migrations for AI service schemas.
- `document_collab_updates` and `document_collab_snapshots` are partially wired: writes and periodic snapshots exist, but room startup does not yet restore persisted Y.js state.

**Infrastructure**

- Docker Compose for local development and production service topology.
- Hetzner VPS for production hosting.
- Coolify as the self-hosted PaaS and deployment UI.
- Cloudflare DNS for `caret.page`.
- Production domains:
  - `caret.page` for the frontend.
  - `api.caret.page` for the API Gateway.
  - `ws.caret.page` for direct collaboration WebSocket traffic.
  - `ops.caret.page` for Coolify operations.

### Current Runtime Shape

```text
Frontend (React/Tiptap)
  | REST/SSE via /api/v1
  v
API Gateway (Express, port 3000)
  | /api/v1/auth       -> auth-service (port 3001)
  | /api/v1/documents  -> document-service (port 3002)
  | /api/v1/workspaces -> document-service (port 3002)
  | /api/v1/folders    -> document-service (port 3002)
  | /api/v1/ai         -> ai-service (port 8000)

Frontend collaboration WebSocket
  -> collab-service /document/{doc_id}?token={jwt} (port 3003)

All services
  -> Supabase Cloud PostgreSQL/Auth/pgvector
```

## System Documentation

AI agents should load the relevant `.agents/skills/*` entry first when one exists for the task. Treat the `caret-*` skills as the maintained project documentation layer.

Keep `AGENTS.md` and the `caret-*` skills up to date. When a change materially affects architecture, infrastructure, data model, service responsibilities, workflows, testing, or roadmap status, document it in the relevant skill and update this hub if the global agent context changes. The goal is that future AI agents can quickly know what exists, what is current, and what should change next without rediscovering stale assumptions.

| Topic | Skill |
|---|---|
| Frontend design system, UI components, React architecture, Tiptap, collaboration UI | `caret-frontend` |
| Backend services, API specs, Node.js/Python services, REST/SSE/WebSocket protocols | `caret-backend` |
| PostgreSQL schema, Supabase, RLS, pgvector, table usage | `caret-database` |
| Infrastructure, Docker, Hetzner, Coolify, Cloudflare, CI/CD | `caret-deployment` |
| QA strategy, Vitest, Pytest, integration tests, verification commands | `caret-testing` |
| Engineering roadmap, completed work, partial work, next steps | `caret-roadmap` |

All paths in agent instructions should be repo-relative unless the user explicitly provides an absolute path.
