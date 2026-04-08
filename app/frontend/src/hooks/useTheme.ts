import { useCallback } from "react";
import { useThemeStore } from "../stores/themeStore";

/**
 * Convenience hook for consuming the theme store in React components.
 *
 * Returns the current theme state and a setter function.
 * Abstracts the Zustand store so components don't depend on it directly.
 *
 * Usage:
 * ```tsx
 * const { theme, resolvedTheme, setTheme } = useTheme();
 * ```
 */
export function useTheme() {
  const theme = useThemeStore((state) => state.theme);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const setThemeAction = useThemeStore((state) => state.setTheme);

  /** Cycle directly between light and dark based on the resolved theme. */
  const toggleTheme = useCallback(() => {
    const nextTheme = resolvedTheme === "light" ? "dark" : "light";
    setThemeAction(nextTheme);
  }, [resolvedTheme, setThemeAction]);

  return { theme, resolvedTheme, setTheme: setThemeAction, toggleTheme } as const;
}
