# Caret - QA & Testing Strategy

This document defines the testing strategy for Caret across frontend, backend, database, collaboration (Y.js), and the AI service. It is designed to align with the architecture in `BACKEND.md`, the data model and RLS in `DATABASE.md`, and the CI/CD pipeline described in `DEPLOYMENT.md`.

## Principles
- **Testing pyramid**: prioritize **unit tests**, add a smaller number of **integration tests**, and keep **E2E tests** focused on critical flows.
- **Fast feedback**: tests must be runnable locally and finish quickly in CI for day-to-day work.
- **Deterministic**: avoid flakiness. Prefer fakes and controlled clocks over real time, random values, or external dependencies.
- **Boundaries matter**: validate behavior at the edges (API contracts, auth/RLS, CRDT sync, SSE streaming), and keep internals unit-tested.
- **Consistent structure**: use the **AAA pattern (Arrange, Act, Assert)** for unit tests, and apply it to integration/E2E tests where it improves clarity.
- **No secrets in tests**: CI uses GitHub Secrets; production/staging use managed secrets (see `DEPLOYMENT.md`).

## What we test (by layer)

### 1) Unit tests (majority)
**Goal**: prove correctness of business logic in isolation.

- **Frontend (React/TS)**: Vitest + React Testing Library
  - Pure utilities (serialization/parsing, formatting, diff logic)
  - Hooks and stores with mocked IO (API calls, WebSocket, SSE)
  - Component behavior that is not best covered by E2E (state transitions, error states, accessibility roles)
- **Node.js services (TS)**: Vitest
  - Domain logic, auth helpers, request validation, DTO mapping
  - Error handling and idempotency logic at the API boundary
- **AI service (Python/FastAPI)**: Pytest
  - Prompt / message assembly, tool selection logic, data transforms
  - Streaming chunk handling logic (without calling real LLM providers)

**Rules of thumb**
- Keep unit tests **network-free**. Use dependency injection and mocks for HTTP, DB, WebSocket, and LLM clients.
- Prefer **table-driven** tests for protocol/state-machine logic (CRDT merges, streaming, retries).
- Use the **AAA pattern (Arrange, Act, Assert)** to structure unit tests (and integration/E2E tests when applicable) so intent is obvious and diffs stay readable.

### 2) Integration tests (selective)
**Goal**: verify components work together with real serialization, real HTTP, and realistic auth boundaries.

- **HTTP APIs**
  - **Node**: Supertest against the API Gateway and/or individual services (where appropriate)
  - **Python**: FastAPI TestClient for AI endpoints
  - Validate: status codes, error payloads, pagination, auth (JWT), and versioned paths (`/api/v1/...`) per `BACKEND.md`
- **Database / RLS**
  - Validate **RLS policies**, permissions matrices (workspace/document roles), and security invariants described in `DATABASE.md`
  - Run against a **dedicated test Supabase project / database** (never production)
- **Collaboration**
  - Validate Y.js update application, snapshot/compaction invariants, and conflict-free merges
  - Validate WebSocket auth handshake (JWT query param) per `BACKEND.md`
- **AI-to-Editor protocol**
  - Validate that SSE streamed text is applied as **Tiptap Transactions** so Y.js sync remains consistent (see `BACKEND.md` and `DATABASE.md` notes on CRDT ownership)

**Contract focus**
- Prefer integration tests for “wire” behavior: schemas, payloads, headers, and permission enforcement—not exhaustive UI.

### 3) End-to-End (E2E) tests (few, critical)
**Tool**: Playwright.

**Goal**: validate the system the way a user experiences it, across browser + backend + auth + collaboration.

**Critical flows**
- Signup/login and session persistence
- Document CRUD: create → edit → autosave/persist → reload
- Collaboration: two browser contexts editing the same doc concurrently, plus presence/cursors
- AI interactions: open AI panel, stream response, apply suggestion safely (CRDT-compatible)

**E2E test design**
- Keep E2E tests **minimal but high-signal**. Anything that can be proven via unit/integration should not be duplicated.
- For destructive operations, use **ephemeral test workspaces/documents** created and torn down by the test run.
- Add targeted accessibility checks (e.g., `axe-core`) on the most important screens; avoid making “full-a11y-audit everywhere” a gate until the UI stabilizes.

## CI/CD execution (GitHub Actions)
Tests run automatically in CI after **every push** to any branch in the repository.

### Pipeline order (must match `DEPLOYMENT.md`)
1. **Linting & type checking** (fail fast)
2. **Unit tests**
3. **Integration tests**
4. **E2E tests** (critical paths only)
5. **Deploy** (only if prior steps succeed)

### Recommended CI split (best practice)
- **On every push**:
  - Lint/typecheck + unit tests for all packages
  - Integration tests that are hermetic and/or use the dedicated test Supabase
  - A small E2E smoke subset (to keep cycle time reasonable)
- **On PRs targeting `main`**:
  - Run the full E2E suite against **staging** (as described in `DEPLOYMENT.md`)
- **Nightly / scheduled**:
  - Full E2E suite + heavier integration matrices (browser matrix, longer collaboration scenarios)

### Required environment separation
- **Staging**: primary target for full E2E gating before production.
- **Production**: tests must be non-destructive and safe by default (see below).

## Production test execution
In production, tests run as **post-deploy verification** and/or scheduled checks. The goal is confidence without risking user data.

### What runs in production
- **Smoke tests** (required): a small Playwright suite that validates:
  - App is reachable, auth works, core routes render
  - Create/edit a document in a **dedicated production “test workspace”** (or a strictly isolated tenant) and clean it up
  - Collaboration connect/disconnect health (basic)
  - AI endpoint reachability with safe prompts (no sensitive data)
- **Synthetic monitoring** (recommended): lightweight HTTP checks + key user journeys at a low frequency.

### Production safety constraints
- Never run tests against real user workspaces or documents.
- Use separate credentials/roles for production smoke tests with least privilege.
- Ensure any created artifacts are tagged and cleaned up automatically.

## Ownership & expectations
- **New features** must include, at minimum, unit tests. Add integration tests when the change crosses boundaries (API, DB/RLS, WebSocket, SSE) or enforces contracts/permissions, and add E2E tests when it affects a critical user flow.
- **Bug fixes** should add a regression test at the lowest layer that reproduces the issue.
- **Flaky tests** are treated as broken production code: fix or quarantine immediately, and reduce reliance on timing-sensitive assertions.
