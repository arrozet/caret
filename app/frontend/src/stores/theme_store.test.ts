import { describe, it, expect, beforeEach } from "vitest";
import { useThemeStore } from "../stores/themeStore";

/**
 * Smoke tests for the theme Zustand store.
 * Validates default state and theme toggling logic.
 */
describe("useThemeStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useThemeStore.getState().setTheme("system");
  });

  it("defaults to system theme", () => {
    const state = useThemeStore.getState();
    expect(state.theme).toBe("system");
  });

  it("sets theme to dark", () => {
    useThemeStore.getState().setTheme("dark");
    const state = useThemeStore.getState();
    expect(state.theme).toBe("dark");
    expect(state.resolvedTheme).toBe("dark");
  });

  it("sets theme to light", () => {
    useThemeStore.getState().setTheme("light");
    const state = useThemeStore.getState();
    expect(state.theme).toBe("light");
    expect(state.resolvedTheme).toBe("light");
  });

  it("resolves system theme to light or dark", () => {
    useThemeStore.getState().setTheme("system");
    const state = useThemeStore.getState();
    expect(state.theme).toBe("system");
    expect(["light", "dark"]).toContain(state.resolvedTheme);
  });
});
