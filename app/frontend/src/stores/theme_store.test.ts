import { describe, it, expect, beforeEach } from "vitest";
import { use_theme_store } from "../stores/theme_store";

/**
 * Smoke tests for the theme Zustand store.
 * Validates default state and theme toggling logic.
 */
describe("use_theme_store", () => {
  beforeEach(() => {
    // Reset store state before each test
    use_theme_store.getState().set_theme("system");
  });

  it("defaults to system theme", () => {
    const state = use_theme_store.getState();
    expect(state.theme).toBe("system");
  });

  it("sets theme to dark", () => {
    use_theme_store.getState().set_theme("dark");
    const state = use_theme_store.getState();
    expect(state.theme).toBe("dark");
    expect(state.resolved_theme).toBe("dark");
  });

  it("sets theme to light", () => {
    use_theme_store.getState().set_theme("light");
    const state = use_theme_store.getState();
    expect(state.theme).toBe("light");
    expect(state.resolved_theme).toBe("light");
  });

  it("resolves system theme to light or dark", () => {
    use_theme_store.getState().set_theme("system");
    const state = use_theme_store.getState();
    expect(state.theme).toBe("system");
    expect(["light", "dark"]).toContain(state.resolved_theme);
  });
});
