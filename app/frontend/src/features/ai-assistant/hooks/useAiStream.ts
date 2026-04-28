import { useState, useCallback, useRef } from "react";
import {
  streamAiResponse,
  createConversation,
  listMessages,
  type DocumentContextSnapshot,
  type MessageResponse,
  type DocumentChangePayload,
} from "../api/aiApi";
import { useAiStore } from "../../../stores/aiStore";

/** A chat message as stored in the hook's local state. */
export interface ChatMessage {
  /** Stable local ID (UUID from server, or a temporary client-side key). */
  id: string;
  /** Sender role. */
  role: "user" | "assistant";
  /** Full message text content. */
  content: string;
  /** Ordered tool names used by the assistant for this reply. */
  tool_calls: string[];
  /** Whether this message is currently being streamed (partial). */
  is_streaming?: boolean;
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
   * @param model_id - Optional model override.
   * @param agent_type - Optional agent type slug (e.g. "general"). Only sent in agent mode.
   */
  send_message: (
    user_message: string,
    document_id: string,
    document_context?: string | DocumentContextSnapshot,
    model_id?: string,
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
          tool_calls: m.tool_calls ?? [],
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
      model_id?: string,
      agent_type?: string,
    ): Promise<void> => {
      if (isLoading) return;

      setError(null);
      setIsLoading(true);

      // Ensure we have an active conversation.
      let conversationId = activeConversationId;
      if (!conversationId) {
        try {
          const generated_title =
            user_message.length > 40 ? user_message.substring(0, 40) + "..." : user_message;
          const conversation = await createConversation(document_id, generated_title);
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
          model_id,
          agent_type,
          signal: controller.signal,
        });

        for await (const chunk of stream) {
          if (chunk.type === "delta" && chunk.content) {
            const currentStreamingId = streamingIdRef.current;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === currentStreamingId
                  ? { ...msg, content: msg.content + chunk.content }
                  : msg,
              ),
            );
          } else if (chunk.type === "tool_call" && chunk.tool_name) {
            const currentStreamingId = streamingIdRef.current;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === currentStreamingId
                  ? {
                      ...msg,
                      tool_calls: [...msg.tool_calls, chunk.tool_name!],
                    }
                  : msg,
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
            setMessages((prev) => prev.filter((msg) => msg.id !== currentStreamingId));
            streamingIdRef.current = null;
          }
        }

        // If the stream ends without a 'done' chunk, finalise anyway.
        if (streamingIdRef.current) {
          const currentStreamingId = streamingIdRef.current;
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
          setMessages((prev) => prev.filter((msg) => msg.id !== currentStreamingId));
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
