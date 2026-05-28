---
name: caret-testing
description: Caret testing strategy - Vitest for frontend and Node services, Pytest for the FastAPI AI service, unit/integration test layout, Makefile targets, deterministic mocks, collaboration protocol tests, AI/RAG tests, and CI expectations. Use when writing tests, fixing tests, setting up test infrastructure, reviewing coverage, or choosing verification commands in the Caret project.
---

# Caret Testing

## Current Tools

| Area | Tooling | Location |
|---|---|---|
| Frontend | Vitest 4, jsdom, React Testing Library | `app/frontend` |
| Node services | Vitest 3, node environment | `app/backend/*-service` |
| Python AI service | Pytest, pytest-asyncio | `app/backend/ai-service` |
| E2E | Not currently configured in repo | Add Playwright only when implementing E2E |

There is currently no `.github/workflows` directory in the repo. Treat GitHub Actions as intended infrastructure, not as a checked-in workflow, until workflow files are added.

## Test Locations

```text
app/frontend/src/**/*.test.ts
app/frontend/src/**/*.test.tsx
app/frontend/src/**/*.integration.test.tsx

app/backend/api-gateway/tests/unit/*.test.ts
app/backend/api-gateway/tests/integration/*.test.ts
app/backend/auth-service/tests/unit/*.test.ts
app/backend/auth-service/tests/integration/*.test.ts
app/backend/document-service/tests/unit/*.test.ts
app/backend/document-service/tests/integration/*.test.ts
app/backend/collab-service/tests/unit/*.test.ts
app/backend/collab-service/tests/integration/*.test.ts

app/backend/ai-service/tests/unit/test_*.py
app/backend/ai-service/tests/integration/test_*.py
```

Frontend has split Vitest configs:

- `vitest.unit.config.ts`
- `vitest.integration.config.ts`
- `src/test/setup.ts`

`src/test/setup.ts` installs `@testing-library/jest-dom` and mocks browser APIs such as `matchMedia` and `scrollIntoView`.

## Commands

Use the nearest package/service command for focused work.

```text
cd app/frontend && bun run test:unit
cd app/frontend && bun run test:integration

cd app/backend/api-gateway && bun run test:unit
cd app/backend/auth-service && bun run test:unit
cd app/backend/document-service && bun run test:unit
cd app/backend/collab-service && bun run test:unit

cd app/backend/ai-service && uv run pytest tests/unit -q
cd app/backend/ai-service && uv run pytest tests/integration -q
```

Root `Makefile` wrappers exist for lint, format, unit, and integration targets per service, for example:

```text
make frontend-test-unit
make document-service-test-integration
make collab-service-test-unit
make ai-service-test-unit
```

## Test Principles

- Keep unit tests deterministic and network-free.
- Mock HTTP, DB, Supabase, WebSocket, and LLM clients in unit tests.
- Put API boundary behavior in integration tests.
- Add regression tests for bug fixes at the lowest useful layer.
- Use table-driven tests for protocol/state-machine behavior.
- Avoid real production Supabase data in tests.
- Keep secrets out of test files and snapshots.

## What To Cover

### Frontend

- Component states, hooks, stores, and API wrappers.
- Editor utilities/extensions without duplicating full browser behavior.
- AI streaming UI and markdown rendering with mocked streams.
- Collaboration URL/session/presence helpers with mocked WebSocket/Y.js boundaries.

### Node Services

- Gateway proxy routing, CORS, rate limits, and OpenAPI metadata.
- Document service validation, repository/service behavior, permissions, and route status codes.
- Auth middleware and shared error middleware.
- Collaboration Y.js protocol handling, awareness, JWT handshake, persistence service, and repository behavior.

### AI Service

- Pydantic schemas and validation.
- Agent orchestration, prompt/dependency assembly, and model catalog behavior.
- SSE chunk behavior without calling real providers.
- Embedding indexing/search behavior with mocked embedding clients.
- Repository behavior for AI tables and pgvector query construction.

## Collaboration Tests

- Test Y.js sync and awareness message behavior at the protocol layer.
- Test `CollabPersistenceService` separately from WebSocket handling.
- Remember current persistence is partially wired: updates/snapshots can be stored, but room initialization does not yet restore from DB.
- When implementing restore-on-room-create, add an integration/regression test that proves a restarted/empty room loads the previous Y.js state.

## CI Expectations

Until workflows exist in `.github/workflows`, use this intended order when creating CI:

```text
1. Lint and format checks
2. Type checks / builds
3. Unit tests
4. Integration tests
5. E2E smoke tests when Playwright exists
6. Deploy from `prod` only after checks pass
```

## Production Safety

- Smoke tests should use dedicated least-privilege test accounts.
- Create isolated workspaces/documents and clean them up.
- Never run destructive tests against real user workspaces or production documents.
