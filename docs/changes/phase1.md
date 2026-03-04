# Phase 1: The Skeleton — Design Decisions & Architecture

This document records every significant technical decision made during Phase 1 of the Caret project. The goal of Phase 1 is defined in `ROADMAP.md` as: **"A deployable React app where users can sign in."**

---

## 1. Monorepo Structure

### Decision
A single Git repository with a flat `app/` directory containing `frontend/` and `backend/` sub-directories. Backend services are split by responsibility under `app/backend/`.

```
caret/
├── app/
│   ├── frontend/              # React SPA (Vite + Bun)
│   └── backend/
│       ├── api-gateway/       # Express proxy (Node.js)
│       ├── auth-service/      # JWT validation (Node.js)
│       ├── document-service/  # Document CRUD (Node.js)
│       ├── collab-service/    # Y.js WebSocket (Node.js)
│       └── ai-service/        # LLM orchestration (Python/FastAPI)
├── docs/
│   ├── guidance/              # Architecture specs (AGENTS.md, ROADMAP.md, etc.)
│   └── changes/               # Phase decision logs (this file)
└── docker-compose.yml
```

### Rationale
- Keeps all source code, infrastructure, and documentation co-located for discoverability.
- Each backend service has its own `package.json` / `pyproject.toml`, enabling independent dependency management and deployment.
- **Bun** is used as the package manager and runtime for all TypeScript/Node.js projects (frontend + 4 backend services) for speed and native TypeScript support.
- **uv** is used for the Python AI service, providing fast dependency resolution and virtual environment management.

---

## 2. Docker Compose for Local Development

### Decision
A single `docker-compose.yml` at the repo root orchestrates all five backend services and the frontend for local development.

### Rationale
- Developers run `docker compose up` to get the full stack running without manual service-by-service setup.
- Environment variables (Supabase URL, anon key, JWT secret, service URLs) are injected via the compose file, sourced from a `.env` file that is `.gitignored`.
- Removed `.env.example` in favor of keeping the real `.env` gitignored — avoids stale examples drifting from actual config.

---

## 3. Testing Frameworks

### Decision
- **Vitest** for all TypeScript services (frontend + 4 Node.js backend services).
- **Pytest** for the Python AI service.

### Rationale
- Vitest integrates natively with Vite (used by the frontend) and provides fast ESM-native test execution.
- For the frontend, Vitest is configured with `jsdom` environment, `@testing-library/react`, and `@testing-library/jest-dom` for component testing.
- `window.matchMedia` is mocked in the test setup (`src/test/setup.ts`) because jsdom does not implement it — required by the theme store.
- Pytest is the standard for Python/FastAPI projects. The AI service uses `httpx.AsyncClient` with `app=FastAPI()` for integration-style endpoint tests.
- All services have `bun run test` (or `uv run pytest`) as the test entry point for consistency.

### Test Coverage (Phase 1)
| Service | Tests | What they cover |
|:--------|:------|:----------------|
| api-gateway | 3 | Config defaults (port, service URLs, allowed origins) |
| auth-service | 13 | Error class hierarchy (7), JWT middleware (6): missing header, bad scheme, invalid token, wrong secret, missing sub, valid token |
| document-service | 3 | Config defaults |
| collab-service | 3 | Config defaults |
| frontend | 4 | Theme store: default system pref, set dark, set light, resolved theme |
| ai-service | — | Config defaults + /health endpoint (requires Python venv) |

### Technical Note
Vitest sets `NODE_ENV=test` during test runs. Config tests must not assert `NODE_ENV === "development"` — they should assert that the value is defined or check for `"test"`.

---

## 4. Tailwind CSS v4 with @theme

### Decision
Use Tailwind CSS v4's `@theme` directive in `index.css` to define design tokens, rather than a `tailwind.config.js` file.

### Rationale
- Tailwind v4 moves configuration into CSS, making tokens co-located with the styles that consume them.
- The Swiss Focus design system tokens (colors, spacing, typography, shadows, border radii, z-index layers) are defined as CSS custom properties in `:root` and `.dark` selectors.
- Light/dark mode uses class-based toggling (`.dark` on `<html>`) with CSS variables, enabling smooth `transition: background-color 200ms ease, color 200ms ease, border-color 200ms ease`.
- All semantic color names from `FRONTEND.md` (bg-app, bg-surface, text-primary, accent-main, accent-caret, accent-ai, etc.) are implemented as CSS variables.

---

## 5. Supabase Auth Integration

### Decision
Client-side authentication using `@supabase/supabase-js`. No server-side auth service for login/signup — Supabase handles it directly.

### Rationale
- Supabase Auth provides email/password authentication, session management, and JWT issuance out of the box.
- The frontend creates a Supabase client (`src/lib/supabase.ts`) configured with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- The auth store (`src/stores/auth_store.ts`) wraps Supabase session state in a Zustand store for reactive access throughout the React app.
- Backend services validate JWTs using the Supabase JWT secret (HS256) — they do not call Supabase APIs.

---

## 6. Zustand for Global UI State

### Decision
Use Zustand for global UI state (theme preferences, auth session).

### Rationale
- Zustand is lightweight (~1KB), has no boilerplate (no reducers, actions, dispatchers), and integrates naturally with React hooks.
- Two stores created in Phase 1:
  - **`theme_store.ts`**: Manages `theme` (system/light/dark), `resolved_theme` (light/dark after resolving system preference), and `set_theme()`. Persists choice in `localStorage` under `caret-theme`.
  - **`auth_store.ts`**: Manages `user`, `session`, `loading`, `initialized` state. Wraps Supabase `onAuthStateChange` listener.
- Follows the state management strategy from `FRONTEND.md` Section 21: Zustand for global UI, React `useState` for local/ephemeral state, TanStack Query for server state (Phase 2+), and Tiptap for editor state (Phase 2+).

---

## 7. react-i18next for Internationalization

### Decision
Set up `react-i18next` with namespace-based JSON translation files from day one.

### Rationale
- i18n is easier to retrofit early than late. All user-facing strings go through `t()` from the start.
- Configuration in `src/lib/i18n.ts`: browser language detection, `localStorage` persistence (`caret-language`), fallback to `en-US`.
- Translation files live in `src/locales/{locale}/{namespace}.json`. Phase 1 includes `en-US/common.json` with auth and theme keys.
- Namespace separation (common, editor, ai, errors) keeps files small and loadable on demand in later phases.

---

## 8. JWT Validation Strategy

### Decision
Backend services validate Supabase JWTs using HS256 with the `SUPABASE_JWT_SECRET` environment variable. Validation is implemented as Express middleware.

### Rationale
- Supabase issues JWTs signed with HS256 using the project's JWT secret. Backend services can verify tokens without calling Supabase APIs.
- The auth middleware (`auth-service/src/middleware/auth_middleware.ts`) extracts the `Authorization: Bearer <token>` header, verifies the signature and expiration, and attaches `req.user = { id: sub }`.
- This middleware is reusable across all Node.js services. The API gateway can apply it before proxying, or individual services can apply it at their own boundary.
- Error responses follow a consistent pattern: 401 for missing/invalid tokens, with descriptive error messages.

---

## 9. API Gateway Proxy Pattern

### Decision
The API gateway uses `express-http-proxy` to forward requests to downstream services based on URL path prefixes.

### Rationale
- The frontend calls only the gateway (`/api/v1/auth/*`, `/api/v1/documents/*`, `/api/v1/ai/*`), as specified in `BACKEND.md`.
- The gateway is a thin routing layer — it does not contain business logic.
- Service URLs are configured via environment variables (`AUTH_SERVICE_URL`, `DOCUMENT_SERVICE_URL`, `AI_SERVICE_URL`), injected by Docker Compose.
- CORS is handled at the gateway level with configurable allowed origins.
- Rate limiting and authentication will be added to the gateway in later phases.

---

## 10. Swiss Focus Design System Implementation

### Decision
Implement the full Swiss Focus design system from `FRONTEND.md` as reusable primitives and layout components.

### What was built in Phase 1

**UI Primitives:**
- `Button.tsx`: Variants (primary, secondary, ghost, danger), sizes (sm, md, lg), loading state, disabled state. Uses Tailwind utility classes mapped to design tokens.
- `Input.tsx`: Label, error state, helper text, focus ring with accent-main color. Matches the input state specifications from `FRONTEND.md` Section 12.

**Layout Components:**
- `TopBar.tsx`: Fixed height 56px (`space-14`), logo, theme toggle, logout button.
- `MainLayout.tsx`: Shell with top bar and content area.
- `AuthGuard.tsx`: Route guard that redirects unauthenticated users to the login page. Shows a loading spinner while auth state initializes.

**Feature Components:**
- `AuthPage.tsx`: Login/signup form with email + password fields, toggle between modes, error display. Uses the auth store and Supabase client.

**Hooks:**
- `use_theme.ts`: Wraps the theme store, provides `toggle_theme()` that cycles system -> light -> dark -> system.

### Design Token Coverage
All tokens from `FRONTEND.md` Section 16 are implemented in `index.css`:
- Colors (light + dark mode, all semantic names)
- Typography (font families, type scale)
- Spacing (4px base unit scale)
- Border radii (Swiss scale: none through full)
- Shadows (subtle, elevated, strong)
- Z-index layers (0 through 100)
- Transitions (timing functions and durations)
- Max-widths (document, document-wide, chat-panel)

---

## 11. Routing with React Router

### Decision
Use React Router v7 with `BrowserRouter` for client-side routing.

### Routes (Phase 1)
| Path | Component | Auth Required |
|:-----|:----------|:-------------|
| `/auth` | `AuthPage` | No |
| `/` | `MainLayout` (placeholder) | Yes (via `AuthGuard`) |
| `*` | Redirect to `/` | — |

### Rationale
- Simple route structure for Phase 1. Protected routes are wrapped in `AuthGuard`, which checks the auth store and redirects to `/auth` if no session exists.
- Future phases will add nested routes for document editing, settings, etc.

---

## Summary

Phase 1 establishes the foundational infrastructure:
- Monorepo with 5 backend services + React frontend
- Docker Compose local dev environment
- Testing across all services (Vitest + Pytest)
- Design system tokens and UI primitives
- Authentication flow (Supabase client-side + JWT validation server-side)
- i18n, theming, and global state management
- API gateway routing

The project is ready to proceed to **Phase 2: The Editor Core**, which introduces Tiptap, document CRUD, and database tables.
