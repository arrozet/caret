# Caret - QA & Testing Strategy

## Testing Philosophy
We prioritize automated testing to ensure the stability of collaborative editing and AI features. We follow the testing pyramid: many unit tests, fewer integration tests, and critical E2E tests.

## Testing Layers

### 1. Unit Testing
- **Frontend**: Vitest + React Testing Library for component logic.
- **Backend (Node.js)**: Vitest for service logic and utility functions.
- **Backend (Python)**: Pytest for AI logic and data transformations.
- **Focus**: Pure functions, data parsers, and individual component behavior.

### 2. Integration Testing
- **API Testing**: Supertest (Node.js) or FastAPI TestClient (Python) to verify endpoints.
- **Database**: Test RLS policies and complex SQL queries against a local Supabase instance.
- **Y.js Sync**: Verify document state merging and conflict resolution.
- **AI-to-Editor Protocol**: Test that AI-streamed text is applied as Tiptap Transactions and correctly synchronized via Y.js across multiple clients.

### 3. End-to-End (E2E) Testing
- **Tool**: **Playwright**.
- **Critical Flows**:
  - User Signup/Login.
  - Document Creation and Saving.
  - **Multi-user Collaboration**: Testing two browser contexts typing in the same document simultaneously.
  - **AI Interactions**: Verifying the AI Chat Panel and streaming responses.
- **Environment**: Run against a staging environment before production deployment.

## Quality Standards
- **Accessibility**: Automated audits using `axe-core` via Playwright.
- **Performance**: Lighthouse CI for frontend performance tracking.
- **Linting**: ESLint (TS) and Ruff (Python) for code style consistency.
- **Type Checking**: Strict TypeScript and Pydantic validation.

## CI Integration
- All tests must pass in GitHub Actions before merging to `main`.
- E2E tests run on every PR that affects the frontend or core services.
