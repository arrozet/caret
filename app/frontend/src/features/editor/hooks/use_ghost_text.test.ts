/**
 * Unit tests for the useGhostText hook.
 *
 * Tests verify that:
 * - The hook initialises with empty suggestion and not loading
 * - trigger_suggestion is a no-op when editor is null
 * - trigger_suggestion exits early when conversation_id is null and conversation
 *   creation fails (best-effort behaviour)
 * - accept_suggestion and dismiss_suggestion are exposed as functions
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGhostText } from "./use_ghost_text";

// Mock the AI API module so no real network calls are made.
vi.mock("../../ai-assistant/api/ai_api", () => ({
  stream_ai_response: vi.fn(),
  create_conversation: vi.fn(),
}));

// Mock the AI store to prevent Zustand from requiring a real provider.
vi.mock("../../../stores/ai_store", () => ({
  use_ai_store: vi.fn(() => ({
    selected_model_id: undefined,
    set_conversation: vi.fn(),
  })),
}));

describe("useGhostText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with empty suggestion and not loading", () => {
    const { result } = renderHook(() =>
      useGhostText({
        editor: null,
        conversation_id: null,
        document_id: "doc-123",
      }),
    );
    expect(result.current.suggestion).toBe("");
    expect(result.current.is_loading).toBe(false);
  });

  it("should not trigger suggestion when editor is null", async () => {
    const { result } = renderHook(() =>
      useGhostText({
        editor: null,
        conversation_id: "conv-123",
        document_id: "doc-123",
      }),
    );
    await act(async () => {
      await result.current.trigger_suggestion();
    });
    expect(result.current.is_loading).toBe(false);
  });

  it("should exit early when conversation_id is null and creation fails", async () => {
    // Simulate a conversation creation failure so the hook silently exits.
    const { create_conversation } = await import("../../ai-assistant/api/ai_api");
    vi.mocked(create_conversation).mockRejectedValueOnce(new Error("Network error"));

    const mock_editor = {
      isDestroyed: false,
      view: {
        dom: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
      commands: {
        clearGhostText: vi.fn(),
      },
      state: {
        selection: {
          $head: {
            start: vi.fn(() => 0),
            end: vi.fn(() => 0),
          },
        },
        doc: {
          textBetween: vi.fn(() => ""),
        },
      },
    } as unknown as import("@tiptap/core").Editor;

    const { result } = renderHook(() =>
      useGhostText({
        editor: mock_editor,
        conversation_id: null,
        document_id: "doc-123",
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
        conversation_id: null,
        document_id: "doc-123",
      }),
    );
    expect(typeof result.current.accept_suggestion).toBe("function");
    expect(typeof result.current.dismiss_suggestion).toBe("function");
  });
});
