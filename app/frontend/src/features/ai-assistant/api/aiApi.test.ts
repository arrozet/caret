// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { streamAiResponse, STREAM_OPEN_TIMEOUT_MS, STREAM_READ_TIMEOUT_MS } from "./aiApi";

vi.mock("../../../lib/supabase", () => ({
  supabase_client: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  },
}));

/** Unit tests for the AI API streaming client. Validates interrupted SSE failure handling. */
describe("streamAiResponse", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Verifies that a stalled SSE reader rejects so the UI can offer Retry. */
  it("throws when the SSE reader stops producing chunks", async () => {
    // Arrange
    const releaseLock = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn(() => new Promise(() => undefined)),
            releaseLock,
          }),
        },
      }),
    );

    const stream = streamAiResponse({
      conversation_id: "conversation-1",
      document_id: "document-1",
      message: "Hello",
    });

    // Act
    const next_chunk = stream.next();
    const assertion = expect(next_chunk).rejects.toThrow("AI stream stalled. Please retry.");
    await vi.advanceTimersByTimeAsync(STREAM_READ_TIMEOUT_MS);

    // Assert
    await assertion;
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  /** Verifies that a request stuck before SSE headers also rejects so the chat cannot spin forever. */
  it("throws when the SSE connection never opens", async () => {
    // Arrange
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }),
    );

    const stream = streamAiResponse({
      conversation_id: "conversation-1",
      document_id: "document-1",
      message: "Hello again",
    });

    // Act
    const next_chunk = stream.next();
    const assertion = expect(next_chunk).rejects.toThrow("AI stream stalled. Please retry.");
    await vi.advanceTimersByTimeAsync(STREAM_OPEN_TIMEOUT_MS);

    // Assert
    await assertion;
  });
});
