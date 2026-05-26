import { useState, useCallback, useRef } from "react";
import {
  streamAiResponse,
  createConversation,
  listMessages,
  type DocumentContextSnapshot,
  type MessageResponse,
  type DocumentChangePayload,
  type ToolCallTrace,
} from "../api/aiApi";
import { useAiStore } from "../../../stores/aiStore";

export interface ToolCallTraceEntry {
  /** Name of the tool the assistant invoked. */
  tool_name: string;
  /** Character offset in the assistant text when the tool was invoked. */
  text_offset: number;
  /** Concise human-readable summary of the tool result. */
  result_summary?: string | null;
  /** Raw serialized tool result payload. */
  result?: unknown;
}

export interface ChatTextSegment {
  /** Plain assistant text streamed in order. */
  type: "text";
  /** Text content for this segment. */
  content: string;
}

export interface ChatToolCallSegment {
  /** Ordered tool-call trace segment. */
  type: "tool_calls";
  /** Tool calls emitted at this point in the stream. */
  tool_calls: ToolCallTraceEntry[];
}

export type ChatMessageSegment = ChatTextSegment | ChatToolCallSegment;

function normalize_tool_call_trace(
  tool_call: string | ToolCallTrace,
  fallback_offset = 0,
): ToolCallTraceEntry {
  if (typeof tool_call === "string") {
    return { tool_name: tool_call, text_offset: fallback_offset };
  }

  return {
    tool_name: tool_call.tool_name,
    text_offset: tool_call.text_offset ?? fallback_offset,
    result_summary: tool_call.result_summary,
    result: tool_call.result,
  };
}

/** A chat message as stored in the hook's local state. */
export interface ChatMessage {
  /** Stable local ID (UUID from server, or a temporary client-side key). */
  id: string;
  /** Sender role. */
  role: "user" | "assistant";
  /** Full message text content. */
  content: string;
  /** Ordered tool traces used by the assistant for this reply. */
  tool_calls: ToolCallTraceEntry[];
  /** Ordered streamed segments used to preserve text/tool chronology. */
  segments?: ChatMessageSegment[];
  /** Whether this message is currently being streamed (partial). */
  is_streaming?: boolean;
}

function upsert_tool_call_trace(
  traces: ToolCallTraceEntry[],
  normalizedTrace: ToolCallTraceEntry,
): ToolCallTraceEntry[] {
  const existingIndex = traces.findIndex(
    (trace) =>
      trace.tool_name === normalizedTrace.tool_name &&
      trace.text_offset === normalizedTrace.text_offset,
  );

  if (existingIndex >= 0) {
    return traces.map((trace, index) =>
      index === existingIndex ? { ...trace, ...normalizedTrace } : trace,
    );
  }

  return [...traces, normalizedTrace];
}

function append_text_segment(
  segments: ChatMessageSegment[] | undefined,
  content: string,
): ChatMessageSegment[] {
  const currentSegments = segments ?? [];
  const lastSegment = currentSegments[currentSegments.length - 1];

  if (lastSegment?.type === "text") {
    return [
      ...currentSegments.slice(0, -1),
      { ...lastSegment, content: lastSegment.content + content },
    ];
  }

  return [...currentSegments, { type: "text", content }];
}

function append_or_update_tool_segment(
  segments: ChatMessageSegment[] | undefined,
  normalizedTrace: ToolCallTraceEntry,
): ChatMessageSegment[] {
  const currentSegments = segments ?? [];

  for (let index = currentSegments.length - 1; index >= 0; index -= 1) {
    const segment = currentSegments[index];
    if (segment?.type !== "tool_calls") {
      break;
    }

    const hasMatchingTrace = segment.tool_calls.some(
      (trace) =>
        trace.tool_name === normalizedTrace.tool_name &&
        trace.text_offset === normalizedTrace.text_offset,
    );

    if (hasMatchingTrace) {
      return currentSegments.map((entry, entryIndex) =>
        entryIndex === index && entry.type === "tool_calls"
          ? { ...entry, tool_calls: upsert_tool_call_trace(entry.tool_calls, normalizedTrace) }
          : entry,
      );
    }
  }

  const lastSegment = currentSegments[currentSegments.length - 1];
  if (lastSegment?.type === "tool_calls") {
    return [
      ...currentSegments.slice(0, -1),
      { ...lastSegment, tool_calls: [...lastSegment.tool_calls, normalizedTrace] },
    ];
  }

  return [...currentSegments, { type: "tool_calls", tool_calls: [normalizedTrace] }];
}

/** Return value of the useAiStream hook. */
export interface UseAiStreamReturn {
  /** Ordered list of messages in the current conversation. */
  messages: ChatMessage[];
  /** Whether a streaming request is in flight. */
  is_loading: boolean;
  /** Error message from the last failed operation (null if none). */
  error: string | null;
  /** A pending document change proposed by the agent (null if none). */
  pending_change: DocumentChangePayload | null;
  /**
   * Send a user message and stream the AI response into `messages`.
   * Creates a new conversation for the document if none is active.
   * @param user_message - The text the user typed.
   * @param document_id - Document UUID, used when creating a new conversation.
   * @param document_context - Optional document plain text for AI context.
   * @param agent_type - Optional agent type slug (e.g. "general"). Only sent in agent mode.
   */
  send_message: (
    user_message: string,
    document_id: string,
    document_context?: string | DocumentContextSnapshot,
    agent_type?: string,
  ) => Promise<void>;
  /**
   * Abort an in-flight streaming request.
   */
  stop_generating: () => void;
  /**
   * Load existing conversation messages from the server.
   * @param conversation_id - Conversation UUID to load.
   */
  load_messages: (conversation_id: string) => Promise<void>;
  /**
   * Clear all messages and reset conversation state.
   */
  clear: () => void;
  /**
   * Clear the pending document change (called after accept or reject).
   */
  clear_pending_change: () => void;
}

/**
 * Hook that manages AI chat state and streaming responses.
 *
 * Calls the AI service streaming endpoint and accumulates SSE delta chunks
 * into the messages list. The streaming assistant message is updated in-place
 * as deltas arrive, then finalised when the "done" event is received.
 *
 * Also handles "tool_call" and "document_change" SSE events emitted by the
 * general agent in agentic mode.
 */
export function useAiStream(): UseAiStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Ref to the AbortController so stop_generating can cancel inflight requests. */
  const abortControllerRef = useRef<AbortController | null>(null);

  /** Stable reference to the streaming assistant message ID being built. */
  const streamingIdRef = useRef<string | null>(null);

  const { activeConversationId, setConversation, pendingDocumentChange, setPendingDocumentChange } =
    useAiStore();

  /**
   * Load messages from an existing conversation into local state.
   */
  const load_messages = useCallback(async (conversation_id: string): Promise<void> => {
    setError(null);
    try {
      const server_messages: MessageResponse[] = await listMessages(conversation_id);
      setMessages(
        server_messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          tool_calls: (m.tool_calls ?? []).map((tool_call) => normalize_tool_call_trace(tool_call)),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    }
  }, []);

  /**
   * Send a user message and stream the AI assistant reply.
   *
   * Flow:
   * 1. If no active conversation exists, create one for the document.
   * 2. Append the user message to local state immediately.
   * 3. Append a placeholder assistant message with is_streaming=true.
   * 4. Consume the SSE generator, updating the assistant message on each delta.
   * 5. On "tool_call" events, accumulate tool names for the badge trace.
   * 6. On "document_change" events, store the payload as pending_change.
   * 7. Finalise the message on "done"; surface error on "error".
   */
  const send_message = useCallback(
    async (
      user_message: string,
      document_id: string,
      document_context?: string | DocumentContextSnapshot,
      agent_type?: string,
    ): Promise<void> => {
      if (isLoading) return;

      setError(null);
      setIsLoading(true);

      // Ensure we have an active conversation.
      let conversationId = activeConversationId;
      if (!conversationId) {
        try {
          const conversation = await createConversation(document_id);
          conversationId = conversation.id;
          setConversation(conversationId);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to create conversation");
          setIsLoading(false);
          return;
        }
      }

      // Append the user's message to the local chat history.
      const userMsgId = `user-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: user_message, tool_calls: [] },
      ]);

      // Append a streaming placeholder for the assistant reply.
      const assistantPlaceholderId = `assistant-streaming-${Date.now()}`;
      streamingIdRef.current = assistantPlaceholderId;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantPlaceholderId,
          role: "assistant",
          content: "",
          tool_calls: [],
          segments: [],
          is_streaming: true,
        },
      ]);

      // Set up cancellation.
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const stream = streamAiResponse({
          conversation_id: conversationId,
          document_id,
          message: user_message,
          document_context,
          agent_type,
          signal: controller.signal,
        });

        for await (const chunk of stream) {
          if (chunk.type === "delta" && chunk.content) {
            const currentStreamingId = streamingIdRef.current;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === currentStreamingId
                  ? {
                      ...msg,
                      content: msg.content + chunk.content,
                      segments: append_text_segment(msg.segments, chunk.content as string),
                    }
                  : msg,
              ),
            );
          } else if (chunk.type === "tool_call") {
            const currentStreamingId = streamingIdRef.current;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id !== currentStreamingId
                  ? msg
                  : (() => {
                      const tool_name = chunk.tool_name ?? chunk.tool_call?.tool_name;
                      const normalizedTrace = chunk.tool_call
                        ? normalize_tool_call_trace(chunk.tool_call, msg.content.length)
                        : tool_name
                          ? { tool_name, text_offset: msg.content.length }
                          : null;

                      if (!normalizedTrace) {
                        return msg;
                      }

                      return {
                        ...msg,
                        tool_calls: upsert_tool_call_trace(msg.tool_calls, normalizedTrace),
                        segments: append_or_update_tool_segment(msg.segments, normalizedTrace),
                      };
                    })(),
              ),
            );
          } else if (chunk.type === "document_change" && chunk.document_change) {
            // Store the proposed document edit for the accept/reject diff viewer.
            setPendingDocumentChange(chunk.document_change);
          } else if (chunk.type === "done") {
            const currentStreamingId = streamingIdRef.current;
            const finalId: string = chunk.message_id ?? currentStreamingId ?? crypto.randomUUID();
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === currentStreamingId ? { ...msg, id: finalId, is_streaming: false } : msg,
              ),
            );
            streamingIdRef.current = null;
          } else if (chunk.type === "error") {
            setError(chunk.error ?? chunk.content ?? "AI service error");
            const currentStreamingId = streamingIdRef.current;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === currentStreamingId ? { ...msg, is_streaming: false } : msg,
              ),
            );
            streamingIdRef.current = null;
          }
        }

        // A stream that finishes without a terminal event was interrupted upstream.
        if (streamingIdRef.current) {
          const currentStreamingId = streamingIdRef.current;
          setError("AI stream ended before completion. Please retry.");
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === currentStreamingId ? { ...msg, is_streaming: false } : msg,
            ),
          );
          streamingIdRef.current = null;
        }
      } catch (err) {
        const currentStreamingId = streamingIdRef.current;
        if ((err as Error).name === "AbortError") {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === currentStreamingId ? { ...msg, is_streaming: false } : msg,
            ),
          );
        } else {
          setError(err instanceof Error ? err.message : "Streaming failed");
          const currentStreamingId = streamingIdRef.current;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === currentStreamingId ? { ...msg, is_streaming: false } : msg,
            ),
          );
        }
        streamingIdRef.current = null;
      } finally {
        abortControllerRef.current = null;
        setIsLoading(false);
      }
    },
    [isLoading, activeConversationId, setConversation, setPendingDocumentChange],
  );

  /**
   * Cancel the in-flight streaming request.
   */
  const stop_generating = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /**
   * Reset all state for a fresh conversation session.
   */
  const clear = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsLoading(false);
    setPendingDocumentChange(null);
    streamingIdRef.current = null;
  }, [setPendingDocumentChange]);

  /**
   * Clear the pending document change (called after accept or reject).
   */
  const clearPendingChange = useCallback(() => {
    setPendingDocumentChange(null);
  }, [setPendingDocumentChange]);

  return {
    messages,
    is_loading: isLoading,
    error,
    pending_change: pendingDocumentChange,
    send_message,
    stop_generating,
    load_messages,
    clear,
    clear_pending_change: clearPendingChange,
  };
}
