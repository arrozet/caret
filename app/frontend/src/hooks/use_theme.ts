import { useCallback } from "react";
import { use_theme_store } from "../stores/theme_store";

/**
 * Convenience hook for consuming the theme store in React components.
 *
 * Returns the current theme state and a setter function.
 * Abstracts the Zustand store so components don't depend on it directly.
 *
 * Usage:
 * ```tsx
 * const { theme, resolved_theme, set_theme } = use_theme();
 * ```
 */
export function use_theme() {
  const theme = use_theme_store((state) => state.theme);
  const resolved_theme = use_theme_store((state) => state.resolved_theme);
  const set_theme_action = use_theme_store((state) => state.set_theme);

  /** Cycle through light -> dark -> system on each call. */
  const toggle_theme = useCallback(() => {
    const next_map = { light: "dark", dark: "system", system: "light" } as const;
    set_theme_action(next_map[theme]);
  }, [theme, set_theme_action]);

  return { theme, resolved_theme, set_theme: set_theme_action, toggle_theme } as const;
}
