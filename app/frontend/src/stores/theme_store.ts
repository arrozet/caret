import { create } from "zustand";

/** Supported theme values. */
type Theme = "light" | "dark" | "system";

/** Resolved theme after applying system preference. */
type ResolvedTheme = "light" | "dark";

/** localStorage key for persisting the user's theme choice. */
const THEME_STORAGE_KEY = "caret-theme";

/** Shape of the theme store managed by Zustand. */
interface ThemeState {
  /** The user's explicit preference (or "system" for OS-level). */
  theme: Theme;
  /** The theme actually applied to the DOM ("light" or "dark"). */
  resolved_theme: ResolvedTheme;
  /** Update the theme preference and apply it to the DOM. */
  set_theme: (theme: Theme) => void;
}

/**
 * Resolve a theme preference to a concrete "light" or "dark" value.
 * When the user selects "system", we read the OS-level preference.
 */
function resolve_theme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

/**
 * Apply the resolved theme to the document element.
 * Adds or removes the "dark" class on <html> (required by Tailwind's
 * class-based dark mode).
 */
function apply_theme_to_dom(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

/**
 * Read the persisted theme from localStorage.
 * Falls back to "system" if nothing is stored or the value is invalid.
 */
function read_stored_theme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

/* Compute initial state before the store is created */
const initial_theme = read_stored_theme();
const initial_resolved = resolve_theme(initial_theme);

/* Apply theme immediately to avoid a flash of wrong theme */
apply_theme_to_dom(initial_resolved);

/**
 * Global theme store.
 *
 * Manages light/dark/system theme preference with localStorage persistence
 * and OS-level media query detection (FRONTEND.md §1 — Theme Toggle Strategy).
 *
 * State management strategy (FRONTEND.md §21):
 *   Global UI state -> Zustand
 */
export const use_theme_store = create<ThemeState>((set) => ({
  theme: initial_theme,
  resolved_theme: initial_resolved,

  set_theme(theme: Theme) {
    const resolved = resolve_theme(theme);
    apply_theme_to_dom(resolved);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    set({ theme, resolved_theme: resolved });
  },
}));

/**
 * Listen for OS-level theme changes so "system" mode stays in sync.
 * This runs once at module load time.
 */
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    const state = use_theme_store.getState();
    if (state.theme === "system") {
      const resolved = resolve_theme("system");
      apply_theme_to_dom(resolved);
      use_theme_store.setState({ resolved_theme: resolved });
    }
  });
