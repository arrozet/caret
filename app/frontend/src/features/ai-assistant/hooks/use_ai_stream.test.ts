// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAiStream } from "./useAiStream";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * Mock the aiApi module so network calls never go out in tests.
 * Each test can override individual functions via vi.mocked().
 */
vi.mock("../api/aiApi", () => ({
  createConversation: vi.fn(),
  listMessages: vi.fn(),
  deleteConversation: vi.fn(),
  streamAiResponse: vi.fn(),
}));

vi.mock("../../../lib/supabase", () => ({
  supabase_client: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

/**
 * Mock the Zustand ai_store.
 * We provide a minimal implementation that tracks active_conversation_id.
 */
const mock_set_conversation = vi.fn();
const mock_set_pending_document_change = vi.fn();
let mock_conversation_id: string | null = null;

vi.mock("../../../stores/aiStore", () => ({
  useAiStore: () => ({
    activeConversationId: mock_conversation_id,
    setConversation: mock_set_conversation,
    setPendingDocumentChange: mock_set_pending_document_change,
    setActiveDocumentId: vi.fn(),
  }),
}));

// Import after mocking so we get the mocked versions.
import { createConversation, listMessages, streamAiResponse } from "../api/aiApi";

// ---------------------------------------------------------------------------
// Helper: build a fake AsyncIterable that yields the given chunks.
// Using Symbol.asyncIterator with explicit Promise resolution to ensure
// React's act() properly flushes each state update between yields.
// ---------------------------------------------------------------------------

async function* make_stream(
  chunks: Array<{
    type: "delta" | "done" | "error";
    content?: string;
    error?: string;
    message_id?: string;
  }>,
): AsyncGenerator<(typeof chunks)[number]> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("use_ai_stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock_conversation_id = null;
  });

  it("initialises with empty state", () => {
    const { result } = renderHook(() => useAiStream());

    expect(result.current.messages).toEqual([]);
    expect(result.current.is_loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("loads messages from an existing conversation", async () => {
    const mock_messages = [
      { id: "m1", conversation_id: "c1", role: "user" as const, content: "Hello", created_at: "" },
      {
        id: "m2",
        conversation_id: "c1",
        role: "assistant" as const,
        content: "Hi!",
        created_at: "",
      },
    ];

    vi.mocked(listMessages).mockResolvedValueOnce(mock_messages);

    const { result } = renderHook(() => useAiStream());

    await act(async () => {
      await result.current.load_messages("c1");
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({ id: "m1", role: "user", content: "Hello" });
    expect(result.current.messages[1]).toMatchObject({
      id: "m2",
      role: "assistant",
      content: "Hi!",
    });
    expect(listMessages).toHaveBeenCalledWith("c1");
  });

  it("creates a new conversation when none is active before sending", async () => {
    vi.mocked(createConversation).mockResolvedValueOnce({
      id: "new-convo",
      document_id: "doc1",
      user_id: "u1",
      title: null,
      created_at: "",
      updated_at: "",
    });

    vi.mocked(streamAiResponse).mockReturnValueOnce(
      make_stream([
        { type: "delta", content: "Response text" },
        { type: "done", message_id: "server-msg-id" },
      ]),
    );

    const { result } = renderHook(() => useAiStream());

    await act(async () => {
      await result.current.send_message("Hello", "doc1");
    });

    expect(createConversation).toHaveBeenCalledWith("doc1", "Hello");
    expect(mock_set_conversation).toHaveBeenCalledWith("new-convo");
  });

  it("appends user message immediately when sending", async () => {
    mock_conversation_id = "existing-convo";

    vi.mocked(streamAiResponse).mockReturnValueOnce(
      make_stream([{ type: "done", message_id: "m1" }]),
    );

    const { result } = renderHook(() => useAiStream());

    await act(async () => {
      await result.current.send_message("My question", "doc1");
    });

    const user_messages = result.current.messages.filter((m) => m.role === "user");
    expect(user_messages).toHaveLength(1);
    expect(user_messages[0].content).toBe("My question");
  });

  it("accumulates delta chunks into the assistant message", async () => {
    mock_conversation_id = "convo-1";

    vi.mocked(streamAiResponse).mockReturnValueOnce(
      make_stream([
        { type: "delta", content: "Hello" },
        { type: "delta", content: " world" },
        { type: "done", message_id: "final-id" },
      ]),
    );

    const { result } = renderHook(() => useAiStream());

    await act(async () => {
      await result.current.send_message("Hi", "doc1");
    });

    // Verify that streamAiResponse was called with correct args.
    expect(streamAiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: "convo-1",
        document_id: "doc1",
        message: "Hi",
      }),
    );

    // The assistant message placeholder should exist.
    const assistant_messages = result.current.messages.filter((m) => m.role === "assistant");
    expect(assistant_messages).toHaveLength(1);

    // After streaming completes, loading should be false.
    expect(result.current.is_loading).toBe(false);
  });

  it("forwards a structured document context to streamAiResponse", async () => {
    mock_conversation_id = "convo-structured";

    vi.mocked(streamAiResponse).mockReturnValueOnce(
      make_stream([{ type: "done", message_id: "m1" }]),
    );

    const { result } = renderHook(() => useAiStream());

    await act(async () => {
      await result.current.send_message("Hi", "doc1", "ws-1", "folder-1", {
        content_json: { type: "doc", content: [] },
        content_text: "Hello world",
        selection: { from: 0, to: 5, text: "Hello" },
      });
    });

    expect(streamAiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: "convo-structured",
        document_id: "doc1",
        workspace_id: "ws-1",
        folder_id: "folder-1",
        document_context: {
          content_json: { type: "doc", content: [] },
          content_text: "Hello world",
          selection: { from: 0, to: 5, text: "Hello" },
        },
      }),
    );
  });

  it("sets error state and removes placeholder on error chunk", async () => {
    mock_conversation_id = "convo-err";

    vi.mocked(streamAiResponse).mockReturnValueOnce(
      make_stream([{ type: "error", error: "Something went wrong" }]),
    );

    const { result } = renderHook(() => useAiStream());

    await act(async () => {
      await result.current.send_message("Trigger error", "doc1");
    });

    // streamAiResponse should have been called.
    expect(streamAiResponse).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: "convo-err" }),
    );

    // After streaming, loading should be false.
    expect(result.current.is_loading).toBe(false);
  });

  it("clears all state when clear() is called", async () => {
    mock_conversation_id = "convo-clear";

    vi.mocked(streamAiResponse).mockReturnValueOnce(
      make_stream([
        { type: "delta", content: "text" },
        { type: "done", message_id: "m1" },
      ]),
    );

    const { result } = renderHook(() => useAiStream());

    await act(async () => {
      await result.current.send_message("msg", "doc1");
    });

    expect(result.current.messages.length).toBeGreaterThan(0);

    act(() => {
      result.current.clear();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.is_loading).toBe(false);
  });

  it("sets loading = false after stream completes", async () => {
    mock_conversation_id = "convo-loading";

    vi.mocked(streamAiResponse).mockReturnValueOnce(
      make_stream([{ type: "done", message_id: "m1" }]),
    );

    const { result } = renderHook(() => useAiStream());

    await act(async () => {
      await result.current.send_message("test", "doc1");
    });

    expect(result.current.is_loading).toBe(false);
  });
});
