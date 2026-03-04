/**
 * Global state definitions (Zustand stores).
 * Manages app-wide UI state that must be shared across features.
 *
 * State categories (see FRONTEND.md §21 — State Management Strategy):
 * - Theme preference (light/dark, persisted in localStorage as "caret-theme")
 * - Sidebar / AI panel visibility
 * - User session data
 * - Open document tabs
 *
 * Rule: Do NOT store editor state here — that belongs to Tiptap (Prosemirror).
 * Rule: Do NOT store server state here — use TanStack Query for async data.
 */
export { use_auth_store } from "./auth_store";
export { use_theme_store } from "./theme_store";
export { use_tabs_store } from "./tabs_store";
export type { Tab } from "./tabs_store";
