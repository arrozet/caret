---
name: caret-frontend
description: Caret frontend — design system, UI components, React/TypeScript architecture, Tiptap editor, Tailwind tokens, state management, animations, and accessibility. Use when building or modifying any frontend code, UI, components, styles, hooks, or when working with the Tiptap editor in the Caret project.
---

# Caret Frontend

## Design Philosophy: "Swiss Focus"

Rigorous, grid-based, minimal. Content-first. Mimics high-end digital paper.

Current visual source of truth: `.impeccable.md`. Use the blue + orange palette there, not a separate purple AI identity.

## Color Tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `bg-app` | `#FAFAFA` | `#121212` | Global background |
| `bg-surface` | `#FFFFFF` | `#1E1E1E` | Document sheet |
| `text-primary` | `#1A1A1A` | `#E8E8E8` | Main content |
| `accent-main` | `#0066CC` | `#3B99FC` | Buttons, links |
| `accent-caret` | `#FF4500` | `#FF6B35` | **User focus + AI features** (brand signature) |
| `border-subtle` | `#E5E5E5` | `#2A2A2A` | Panel separators |

Do not introduce purple AI accents. AI uses `accent-caret` so it feels integrated with the core writing experience.

Theme switching: class-based dark mode (`.dark`). Persist to `localStorage` as `caret-theme`.

## Typography

- **UI**: Inter · **Document canvas**: Merriweather · **Code**: Fira Code
- Body text inside editor: 18px / 1.7 line-height
- Swiss heading style: `font-weight: 400`, `letter-spacing: -0.02em` (no bold headings)
- Keep hierarchy driven by size and spacing, not extra color or weight.

## Layout

- Document max-width: 800px (900px on >1440px displays)
- AI Chat Panel: 400px fixed right sidebar, toggle `Ctrl/Cmd+K`
- Top bar: 56px fixed · Base grid unit: 4px

## Tech Stack

- React + TypeScript + Vite
- TailwindCSS v4 (class-based dark mode)
- Tiptap v3 (rich text, ProseMirror)
- Zustand (global state) · TanStack Query (server/async state)
- react-i18next (en-US, es, fr, de, pt)
- Framer Motion (landing page only)
- Lucide React (icons, `stroke-width={2}`)
- **Bun** — package manager. Never npm, yarn, or pnpm.

## Directory Structure (Feature-First)

```
src/
├── features/
│   ├── editor/        # CaretEditor, EditorToolbar, EditorPage, DocumentList
│   │   ├── components/
│   │   ├── hooks/     # use_document, use_documents, use_save_document
│   │   └── api/       # document_api.ts
│   ├── ai-assistant/  # ChatPanel, DiffView, useCompletion, streamingClient
│   ├── auth/          # LoginPage
│   ├── landing/       # LandingPage, AnimatedMockup
│   ├── settings/      # SettingsPage
│   └── collaboration/ # Y.js UI (UserAvatars, LiveCursor)
├── components/
│   ├── ui/            # "Dumb" primitives: Button, Input, Modal, Toast, Logo
│   └── layout/        # TopBar, MainLayout
├── hooks/             # use_theme, use_focus_mode (shared)
├── stores/            # auth_store.ts, theme_store.ts (Zustand)
├── locales/           # en-US/, es/, fr/, ...
├── lib/               # supabase.ts, i18n.ts
└── styles/index.css   # TailwindCSS v4 @theme + editor styles
```

## Naming

- Variables/functions: `snake_case` (e.g. `use_document`, `create_document`)
- Classes/components: `CamelCase` (e.g. `EditorToolbar`, `ChatPanel`)

## State Management Rules

| State | Tool | Rule |
|---|---|---|
| Editor content | Tiptap/ProseMirror | NEVER duplicate in React state |
| Global UI (theme, sidebar) | Zustand | |
| Server data (documents) | TanStack Query | |
| Local/ephemeral | React `useState` | |

## Component Patterns

- **Composition over prop drilling**: `<Layout><Header /><Content /></Layout>`
- **Compound components** for complex UI: `<Dropdown.Trigger>`, `<Dropdown.Menu>`
- **Lazy loading**: AI Chat Panel uses `React.lazy()`
- Primitives in `components/ui/` have NO business logic

## Key Behaviors

- **Focus Mode**: after 2s inactivity → peripheral UI fades to 20% opacity
- **AI SSE streaming**: chunks applied as Tiptap Transactions → Y.js sync auto-maintained
- AI Service **never** writes to DB directly
- AI surfaces should use `accent-caret`, not a separate purple brand color

## Animations (Framer Motion — landing only)

- Animate only `transform` and `opacity` (GPU-accelerated, never `width/height/top/left`)
- Gate all decorative/continuous animations behind `useReducedMotion()`
- Springs: `stiffness: 110–260 / damping: 18–24`

## Accessibility

- WCAG AA minimum (4.5:1 contrast ratio for normal text)
- `aria-live="polite"` on AI streaming regions
- Focus trapped in modals; returned to trigger on close
- All Lucide icons need text alternatives
- Focus indicators should use `accent-main` at 40% opacity with a 3px ring

## Z-Index Layers

`0` doc surface → `10` decorators → `20` collab cursors → `30` chrome → `40` floating UI → `50` modals → `100` tooltips/toasts
