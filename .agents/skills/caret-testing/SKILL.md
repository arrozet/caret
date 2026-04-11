---
name: caret-testing
description: Caret testing strategy — testing pyramid, unit/integration/E2E test guidelines, Vitest, Pytest, Playwright, CI pipeline order, and production smoke tests. Use when writing tests, setting up test infrastructure, reviewing test coverage, or when any testing question arises in the Caret project.
---

# Caret Testing

## Principles

- **Pyramid**: unit (majority) → integration (selective) → E2E (few, critical)
- **AAA pattern**: every test must be structured as Arrange / Act / Assert and each phase must be marked with an inline comment (`// Arrange`, `// Act`, `// Assert` in TS/JS; `# Arrange`, `# Act`, `# Assert` in Python)
- **Docstrings everywhere**: every test file, every `describe`/class block, and every individual `it`/test function must have a docstring explaining *what* is validated and *why* (JSDoc `/** */` in TypeScript, `"""..."""` in Python)
- **Deterministic**: no real time, random values, or external dependencies in unit tests
- **Network-free unit tests**: mock HTTP, DB, WebSocket, and LLM clients
- **No secrets in tests**: use GitHub Secrets (CI) or managed secrets (staging/prod)

## AAA Pattern & Docstring Convention

### TypeScript (Vitest)
```ts
/** Unit tests for <module>. Validates <what and why>. */
describe("<subject>", () => {
  /** <what this group tests> */
  describe("<scenario>", () => {
    it("<expected behaviour>", () => {
      // Arrange
      const input = ...;

      // Act
      const result = fn(input);

      // Assert
      expect(result).toBe(...);
    });
  });
});
```

### Python (Pytest)
```python
class TestSomething:
    """Unit tests for Something. Validates <what and why>."""

    def test_something(self):
        """Verifies that <expected behaviour> when <condition>."""
        # Arrange
        value = ...

        # Act
        result = fn(value)

        # Assert
        assert result == ...
```

## Test Tools by Layer

| Layer | Frontend | Node.js services | Python AI Service |
|---|---|---|---|
| Unit | Vitest + React Testing Library | Vitest | Pytest |
| Integration | — | Supertest | FastAPI TestClient |
| E2E | Playwright | — | — |

## What to Test

### Unit Tests
- **Frontend**: pure utilities, hooks/stores with mocked IO, component state transitions
- **Node.js**: domain logic, auth helpers, request validation, DTO mapping, error handling
- **Python**: prompt assembly, tool selection, data transforms, streaming chunk logic (no real LLM)
- Table-driven tests for protocol/state-machine logic (CRDT merges, streaming, retries)

### Integration Tests
- **APIs**: status codes, error payloads, pagination, JWT auth, versioned paths (`/api/v1/...`)
- **DB/RLS**: validate RLS policies and permissions — run against **dedicated test Supabase project**, never production
- **Collaboration**: Y.js update application, snapshot invariants, WebSocket auth handshake
- **AI protocol**: SSE chunks applied as Tiptap Transactions maintaining CRDT consistency

### E2E Tests (Playwright — critical paths only)
- Signup/login and session persistence
- Document CRUD: create → edit → autosave → reload
- Collaboration: two browser contexts editing concurrently + presence/cursors
- AI interactions: open panel, stream response, apply suggestion (CRDT-compatible)
- Use ephemeral test workspaces/documents; always tear down after run
- Targeted `axe-core` accessibility checks on critical screens

## CI Pipeline Order (GitHub Actions)

```
1. Lint + type check  (fail fast — blocks everything if fails)
2. Unit tests
3. Integration tests
4. E2E tests          (smoke subset on every push; full suite on PRs to main)
5. Deploy             (only if all above pass)
```

- **Every push**: lint + unit + hermetic integration + E2E smoke subset
- **PRs to `main`**: full E2E against staging
- **Nightly**: full E2E + browser matrix + heavy collaboration scenarios

## Production Safety

- Smoke tests only: app reachable, auth works, CRUD in isolated test workspace, collab health
- Never test against real user workspaces or documents
- Dedicated production test credentials with least privilege
- All created artifacts tagged and auto-cleaned

## Ownership Rules

- **New feature**: unit tests minimum; integration if it crosses API/DB/WebSocket boundaries; E2E if critical user flow
- **Bug fix**: regression test at the lowest layer that reproduces the issue
- **Flaky tests**: treat as broken production code — fix or quarantine immediately
