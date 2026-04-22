/**
 * Unit tests for the useGhostText hook.
 *
 * Tests verify that:
 * - The hook initialises with empty suggestion and not loading
 * - trigger_suggestion is a no-op when editor is null
 * - trigger_suggestion is a no-op when conversationId is null
 * - accept_suggestion and dismiss_suggestion are exposed as functions
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { mock_complete_text } = vi.hoisted(() => ({
  mock_complete_text: vi.fn().mockResolvedValue({ completion: " there" }),
}));

vi.mock("../../ai-assistant/api/aiApi", () => ({
  completeText: mock_complete_text,
}));
import { useGhostText } from "./useGhostText";

describe("useGhostText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with empty suggestion and not loading", () => {
    const { result } = renderHook(() =>
      useGhostText({
        editor: null,
        conversationId: null,
      }),
    );
    expect(result.current.suggestion).toBe("");
    expect(result.current.is_loading).toBe(false);
  });

  it("should not trigger suggestion when editor is null", async () => {
    const { result } = renderHook(() =>
      useGhostText({
        editor: null,
        conversationId: "conv-123",
      }),
    );
    await act(async () => {
      await result.current.trigger_suggestion();
    });
    expect(result.current.is_loading).toBe(false);
  });

  it("should not trigger suggestion when conversationId is null", async () => {
    const mock_editor = {
      view: {
        dom: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
      commands: {
        setGhostText: vi.fn(),
        clearGhostText: vi.fn(),
      },
    } as unknown as import("@tiptap/core").Editor;

    const { result } = renderHook(() =>
      useGhostText({
        editor: mock_editor,
        conversationId: null,
      }),
    );
    await act(async () => {
      await result.current.trigger_suggestion();
    });
    expect(result.current.is_loading).toBe(false);
  });

  it("should expose accept_suggestion and dismiss_suggestion callbacks", () => {
    const { result } = renderHook(() =>
      useGhostText({
        editor: null,
        conversationId: null,
      }),
    );
    expect(typeof result.current.accept_suggestion).toBe("function");
    expect(typeof result.current.dismiss_suggestion).toBe("function");
  });

  it("should request a completion after typing pauses", async () => {
    vi.useFakeTimers();

    try {
      const dom = document.createElement("div");
      const mock_editor = {
        isDestroyed: false,
        view: { dom },
        state: {
          selection: {
            $head: {
              start: () => 0,
              end: () => 5,
            },
          },
          doc: {
            textBetween: vi.fn(() => "Hello"),
          },
        },
        commands: {
          setGhostText: vi.fn(),
          clearGhostText: vi.fn(),
        },
      } as unknown as import("@tiptap/core").Editor;

      renderHook(() =>
        useGhostText({
          editor: mock_editor,
          conversationId: "conv-123",
        }),
      );

      await act(async () => {
        dom.dispatchEvent(new Event("input", { bubbles: true }));
        await vi.advanceTimersByTimeAsync(400);
      });

      expect(mock_complete_text).toHaveBeenCalledTimes(1);
      expect(mock_editor.commands.setGhostText as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        " there",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
