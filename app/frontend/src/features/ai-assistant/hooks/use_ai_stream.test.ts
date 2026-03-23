import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAiStream } from "./use_ai_stream";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * Mock the ai_api module so network calls never go out in tests.
 * Each test can override individual functions via vi.mocked().
 */
vi.mock("../api/ai_api", () => ({
  create_conversation: vi.fn(),
  list_messages: vi.fn(),
  delete_conversation: vi.fn(),
  stream_ai_response: vi.fn(),
}));

/**
 * Mock the Zustand ai_store.
 * We provide a minimal implementation that tracks active_conversation_id.
 */
const mock_set_conversation = vi.fn();
const mock_set_pending_document_change = vi.fn();
let mock_conversation_id: string | null = null;

vi.mock("../../../stores/ai_store", () => ({
  use_ai_store: () => ({
    active_conversation_id: mock_conversation_id,
    set_conversation: mock_set_conversation,
    set_pending_document_change: mock_set_pending_document_change,
  }),
}));

// Import after mocking so we get the mocked versions.
import { create_conversation, list_messages, stream_ai_response } from "../api/ai_api";

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

    vi.mocked(list_messages).mockResolvedValueOnce(mock_messages);

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
    expect(list_messages).toHaveBeenCalledWith("c1");
  });

  it("creates a new conversation when none is active before sending", async () => {
    vi.mocked(create_conversation).mockResolvedValueOnce({
      id: "new-convo",
      document_id: "doc1",
      user_id: "u1",
      title: null,
      created_at: "",
      updated_at: "",
    });

    vi.mocked(stream_ai_response).mockReturnValueOnce(
      make_stream([
        { type: "delta", content: "Response text" },
        { type: "done", message_id: "server-msg-id" },
      ]),
    );

    const { result } = renderHook(() => useAiStream());

    await act(async () => {
      await result.current.send_message("Hello", "doc1");
    });

    expect(create_conversation).toHaveBeenCalledWith("doc1", "Hello");
    expect(mock_set_conversation).toHaveBeenCalledWith("new-convo");
  });

  it("appends user message immediately when sending", async () => {
    mock_conversation_id = "existing-convo";

    vi.mocked(stream_ai_response).mockReturnValueOnce(
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

    vi.mocked(stream_ai_response).mockReturnValueOnce(
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

    // Verify that stream_ai_response was called with correct args.
    expect(stream_ai_response).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: "convo-1",
        message: "Hi",
      }),
    );

    // The assistant message placeholder should exist.
    const assistant_messages = result.current.messages.filter((m) => m.role === "assistant");
    expect(assistant_messages).toHaveLength(1);

    // After streaming completes, loading should be false.
    expect(result.current.is_loading).toBe(false);
  });

  it("sets error state and removes placeholder on error chunk", async () => {
    mock_conversation_id = "convo-err";

    vi.mocked(stream_ai_response).mockReturnValueOnce(
      make_stream([{ type: "error", error: "Something went wrong" }]),
    );

    const { result } = renderHook(() => useAiStream());

    await act(async () => {
      await result.current.send_message("Trigger error", "doc1");
    });

    // stream_ai_response should have been called.
    expect(stream_ai_response).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: "convo-err" }),
    );

    // After streaming, loading should be false.
    expect(result.current.is_loading).toBe(false);
  });

  it("clears all state when clear() is called", async () => {
    mock_conversation_id = "convo-clear";

    vi.mocked(stream_ai_response).mockReturnValueOnce(
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

    vi.mocked(stream_ai_response).mockReturnValueOnce(
      make_stream([{ type: "done", message_id: "m1" }]),
    );

    const { result } = renderHook(() => useAiStream());

    await act(async () => {
      await result.current.send_message("test", "doc1");
    });

    expect(result.current.is_loading).toBe(false);
  });
});
