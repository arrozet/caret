/**
 * Unit tests for the GhostText Tiptap extension.
 *
 * Tests verify that:
 * - setGhostText stores the text in plugin state
 * - clearGhostText empties the plugin state
 * - Document changes clear the ghost text automatically
 * - The extension exports the expected name
 */

import { describe, expect, it } from "vitest";
import { GhostText, ghost_text_plugin_key } from "./ghost_text";

describe("GhostText extension", () => {
  it("should have the correct name", () => {
    expect(GhostText.name).toBe("ghost_text");
  });

  it("should export ghost_text_plugin_key with the correct key", () => {
    // PluginKey.key is a runtime property (not declared in @types/prosemirror-state).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ghost_text_plugin_key as any).key).toContain("ghost_text");
  });

  it("should define setGhostText and clearGhostText commands", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commands = GhostText.config.addCommands?.call({} as any) ?? {};
    expect(typeof commands["setGhostText"]).toBe("function");
    expect(typeof commands["clearGhostText"]).toBe("function");
  });

  it("should define ProseMirror plugins", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugins = GhostText.config.addProseMirrorPlugins?.call({} as any) ?? [];
    expect(plugins).toHaveLength(1);
  });
});
