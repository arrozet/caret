# Caret - System Documentation Hub

## Introduction

You are an expert software engineer and AI specialist. Your goal is to implement **Caret**, an agentic, AI-first document editor for collaborative and structured writing. Caret integrates true agentic capabilities into a rich document editor, allowing AI to understand, modify, and enhance documents intelligently.

## Vision & Problem Statement

### Vision
Caret addresses a critical gap in the market: while agentic IDEs like Cursor and Copilot have transformed code writing, document editing remains stagnant. Current solutions offer limited agentic capabilities—they're essentially chat toggles with minimal document interaction. Caret aims to change this by providing true agentic capabilities integrated into a rich document editor.

### Problem Statement
Document writing is not as "agile" as code writing with modern AI tools. No major company is effectively integrating AI into Word/Google Docs-like editors with genuine agentic capabilities.

## What's in a Name?

**Caret** (^) - The caret symbol indicates the cursor position where text will be inserted. It was chosen because it is:
- Concise and memorable.
- Directly related to document writing and editing.
- Technically meaningful yet distinctive.

## Development Guidelines

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
    - **Conventional Commits**: Use the [Conventional Commits](https://www.conventionalcommits.org/) standard. Prefix messages with a type such as `feat` (new feature), `fix` (bug fix), `docs`, `style`, `refactor`, `test`, `chore`, etc., e.g. `feat(editor): add bold formatting` or `fix(auth): resolve session expiry`.
    - **Incremental commits**: Make small, focused commits rather than large ones. This makes it easier to locate regressions, revert changes, and review code; avoid committing many unrelated changes in a single commit.
    - **Branches**: Use a dedicated branch for each significant change (feature, fix, or refactor). Create branches from the main line, work in isolation, and merge back via pull/merge requests so changes are traceable and reviewable.
  - **Code Review**: Ensure all code changes are reviewed before merging to maintain quality standards.

### Code Style & Naming Conventions

- **Variables and Functions**: Use `snake_case` for all variable and function names across the codebase (both frontend and backend).
- **Classes**: Use `CamelCase` for class names (when applicable).
- **Consistency**: Maintain consistent naming conventions throughout the entire project to ensure code readability and maintainability.

### Documentation Standards

- **Docstrings**: All functions and classes must include docstrings written in English, regardless of whether they're in the frontend or backend codebase.
- **Code Comments**: Code should be clearly and correctly commented in English. Add explanatory comments for:
  - Technical or complex logic
  - Specific implementation details
  - Unclear or non-obvious code sections
  - Algorithm explanations and design decisions
- **Purpose**: Documentation should help developers understand the more technical, specific, or unclear parts of the codebase.

## High-Level Architecture

### Tech Stack Overview

**Frontend**
- React + TypeScript
- Vite (build tool)
- TailwindCSS (styling with "Swiss Focus" theme)
- Tiptap (rich text editor)
- Lucide React (icons)
- react-i18next (internationalization)
- Bun (package manager)

**Backend**
- Node.js + TypeScript (Document Service, Collaboration Service)
- Express + tsoa (HTTP framework + OpenAPI generation)
- Drizzle ORM (type-safe SQL ORM for Node.js services)
- Y.js (CRDT for real-time collaboration)
- Python + FastAPI (AI Service)
- SQLAlchemy async (ORM for Python AI service)
- PydanticAI (agentic framework)
- Bun + uv (package managers)


**Database & Storage**
- PostgreSQL (Supabase)
- pgvector (vector embeddings for RAG)
- Supabase Auth
- **Required PostgreSQL extensions**: `pgcrypto`, `vector` (pgvector), `citext`, `pg_trgm`, `pg_stat_statements` — see [DATABASE.md](./DATABASE.md).

**Infrastructure**
- Vercel (Frontend hosting)
- AWS Lambda (Stateless services)
- AWS ECS (WebSocket service)
- Docker Compose (Local dev)

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│                  Tiptap + TailwindCSS + TypeScript              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ (REST API / WebSocket / SSE)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway (Node.js)                      │
│              Request Routing / Auth / Rate Limiting             │
│                      AWS Lambda (SST)                            │
└────────┬───────────┬───────────┬───────────┬────────────────────┘
         │           │           │           │
         │           │           │           │
    ┌────▼────┐ ┌────▼────┐ ┌────▼────────┐ ┌────▼──────────┐
    │  Auth   │ │Document │ │Collaboration│ │  AI Service   │
    │ Service │ │ Service │ │  Service    │ │ (Python/      │
    │(Node.js)│ │(Node.js)│ │ (Y.js/      │ │ FastAPI)      │
    │ Lambda  │ │ Lambda  │ │ Node.js)    │ │ ECS Fargate   │
    └────┬────┘ └────┬────┘ │ ECS Fargate │ └──────┬────────┘
         │           │      └─────┬───────┘        │
         │           │            │                 │
         └───────────┼────────────┼─────────────────┘
                     │            │
        ┌────────────┼────────────┼────────────┐
        │            │            │            │
        ▼            ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ PostgreSQL   │ │ pgvector     │ │ Supabase Auth│
│ (Supabase)   │ │ (Embeddings) │ │              │
└──────────────┘ └──────────────┘ └──────────────┘

Future (v2.0):
┌──────────────┐
│ Cache/Queue  │
│ (Redis)      │
└──────────────┘
```

## System Documentation Index

This hub connects all detailed technical specifications for the Caret project.

| File | Description |
|:---|:---|
| **[FRONTEND.md](./FRONTEND.md)** | Design system, UI components, and React architecture. |
| **[BACKEND.md](./BACKEND.md)** | Microservices architecture, API specifications, and Node.js/Python services. |
| **[DATABASE.md](./DATABASE.md)** | PostgreSQL schema, Supabase configuration, and Vector storage (pgvector). |
| **[DEPLOYMENT.md](./DEPLOYMENT.md)** | Infrastructure-as-Code, AWS services (Lambda/ECS), and CI/CD pipelines. |
| **[TESTING.md](./TESTING.md)** | QA strategies, E2E testing (Playwright), and unit testing standards. |
| **[ROADMAP.md](./ROADMAP.md)** | Execution phases and step-by-step engineering checklist. |
