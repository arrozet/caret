---
name: caret-frontend
description: Caret frontend - React 19, TypeScript, Vite, TailwindCSS v4, Tiptap 3 editor, TanStack Query, Zustand, Supabase auth/profile, AI assistant UI, Y.js collaboration UI, routing, i18n, accessibility, and Swiss Focus design conventions. Use when building or modifying frontend code, UI components, styles, hooks, stores, editor behavior, AI assistant surfaces, or collaboration UI in the Caret project.
---

# Caret Frontend

## Current Stack

- React 19 + TypeScript + Vite 7.
- TailwindCSS v4 through `@tailwindcss/vite` and `src/index.css` `@theme`.
- Tiptap 3 and ProseMirror for the editor.
- Y.js, `@tiptap/extension-collaboration`, `@tiptap/y-tiptap`, and `y-websocket` for collaboration.
- TanStack Query v5 for server state.
- Zustand v5 for auth, theme, AI panel, and open document tabs.
- Supabase JS for auth and `user_profiles`.
- `react-router-dom` v7 for client routing.
- `react-i18next` / `i18next` for locales.
- Lucide React for most icons; Font Awesome brand icons are also installed.
- Framer Motion is used mainly on landing surfaces.
- `react-markdown` + `remark-gfm` render AI markdown responses.
- Package manager: **Bun only**.

## Design Source Of Truth

- Use `.impeccable.md` and current `app/frontend/src/index.css`.
- The current palette is blue + orange. Do not add a separate purple AI identity.
- AI and focus moments should use the Caret orange accent so they feel native to the editor.
- Tailwind config is not a separate `tailwind.config.js`; tokens live in CSS through Tailwind v4.
- Prefer dense, document-editor ergonomics over marketing layouts inside the app.

## Routes

Current routes in `src/App.tsx`:

| Route | Access | View |
|---|---|---|
| `/` | Public | Landing page |
| `/login` | Public | Landing page with auth modal |
| `/documents` | Authenticated | Document list |
| `/documents/:id` | Authenticated | Editor page |
| `/settings` | Authenticated | Settings |
| `/debug/collab-harness` | Development only | Collaboration harness |

Protected routes are wrapped with `AuthGuard` and `MainLayout`.

## Directory Shape

```text
app/frontend/src/
  App.tsx
  main.tsx
  index.css
  components/
    layout/
    ui/
  features/
    ai-assistant/
    auth/
    collaboration/
    editor/
    landing/
    settings/
  hooks/
  lib/
  locales/
  stores/
  test/
```

Feature folders commonly contain `api/`, `components/`, `hooks/`, `utils/`, or `extensions/` depending on the feature.

## Naming And Style

- Follow the existing codebase over older guidance docs.
- Components and files for components use `PascalCase`, for example `EditorPage.tsx`.
- Stores and hooks currently use camelCase filenames, for example `authStore.ts`, `useTheme.ts`, and `useCollaborationSession.ts`.
- Keep exported React hooks named with `use...`.
- Avoid introducing `snake_case` frontend filenames just because older docs mention them.

## State Rules

| State | Owner |
|---|---|
| Editor document model | Tiptap/ProseMirror and collaboration extensions |
| Server data | TanStack Query |
| Auth/session/profile | Zustand store plus Supabase |
| Theme | Zustand store persisted as `caret-theme` |
| Language | i18next persisted as `caret-language` |
| AI panel/session UI | Zustand and feature hooks |
| Open document tabs | Zustand tabs store |

Do not duplicate editor content into React state unless the component is explicitly deriving a transient view.

## API And Runtime Config

- Use `src/lib/apiClient.ts` for gateway HTTP calls.
- Use `src/lib/runtimeConfig.ts` for runtime environment selection.
- Frontend production points to `https://api.caret.page/api/v1` and `wss://ws.caret.page/document`.
- Collaboration direct WebSocket is expected and should not be proxied through the gateway.
- Use Supabase JS directly only for auth/profile flows already established in `authStore.ts`.

## Editor And AI

- Editor code lives in `features/editor`.
- AI assistant code lives in `features/ai-assistant`.
- Collaboration UI and helpers live in `features/collaboration`.
- `EditorPage` lazy-loads `ChatPanel`.
- `Ctrl/Cmd+K` toggles the AI panel.
- AI UI supports `ask` and `agent` modes; agent types include `general` and `analyst`.
- `aiStore.ts` currently defaults the panel to open and the mode to `agent`.
- Embeddings are indexed from the editor via AI API helpers after saves.
- AI suggestions should be represented as editor-compatible operations/extensions, not as direct DB writes to document content.
- Pending document changes can be reviewed and accepted/rejected from the editor UI.
- When a collaboration document is present, accepted AI changes should update the collaboration document directly.
- Preserve Tiptap/Y.js consistency when applying streamed or suggested text.

## Collaboration UI

- Use `useCollaborationSession` and `useCollaborationPresence` for collaboration lifecycle/presence.
- Tiptap collaboration uses a `Y.Doc`, `y-websocket`, `Collaboration`, and `CollaborationCursor`.
- UI components include `CollaborationPresenceBar`, `LivePresenceIndicator`, `RemoteCursor`, and `CollaboratorsList`.
- `/debug/collab-harness` is development-only and useful for manual collaboration checks.

## i18n

- Supported locales are `en-US`, `es`, `fr`, `de`, and `pt`.
- Add copy to the locale JSON files instead of hardcoding reusable UI strings.
- Persist selected language with `caret-language`.

## Testing Commands

```text
cd app/frontend
bun run test
bun run test:unit
bun run test:integration
bun run test:watch
bun run lint
bun run format:check
bun run build
```

Unit tests use Vitest + jsdom + React Testing Library. `src/test/setup.ts` configures common DOM mocks.

## Accessibility

- Keep interactive controls keyboard reachable.
- Use semantic buttons/links and visible focus states.
- Use `aria-live="polite"` for streaming AI regions.
- Trap focus in modals and return focus to the trigger on close.
- Icons need accessible names when they are the only visible label.
