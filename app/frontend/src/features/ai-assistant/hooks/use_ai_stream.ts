import { useState, useCallback, useRef } from "react";
import {
  stream_ai_response,
  create_conversation,
  list_messages,
  type MessageResponse,
  type DocumentChangePayload,
} from "../api/ai_api";
import { use_ai_store } from "../../../stores/ai_store";

/** A chat message as stored in the hook's local state. */
export interface ChatMessage {
  /** Stable local ID (UUID from server, or a temporary client-side key). */
  id: string;
  /** Sender role. */
  role: "user" | "assistant";
  /** Full message text content. */
  content: string;
  /** Whether this message is currently being streamed (partial). */
  is_streaming?: boolean;
}

/** Return value of the use_ai_stream hook. */
export interface UseAiStreamReturn {
  /** Ordered list of messages in the current conversation. */
  messages: ChatMessage[];
  /** Whether a streaming request is in flight. */
  is_loading: boolean;
  /** Error message from the last failed operation (null if none). */
  error: string | null;
  /** A pending document change proposed by the agent (null if none). */
  pending_change: DocumentChangePayload | null;
  /** List of tool names called during the current/last agent run. */
  tool_calls: string[];
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
    document_context?: string,
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
  const [messages, set_messages] = useState<ChatMessage[]>([]);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [tool_calls, set_tool_calls] = useState<string[]>([]);

  /** Ref to the AbortController so stop_generating can cancel inflight requests. */
  const abort_controller_ref = useRef<AbortController | null>(null);

  /** Stable reference to the streaming assistant message ID being built. */
  const streaming_id_ref = useRef<string | null>(null);

  const {
    active_conversation_id,
    set_conversation,
    pending_document_change,
    set_pending_document_change,
  } = use_ai_store();
  const pending_change = pending_document_change;

  /**
   * Load messages from an existing conversation into local state.
   */
  const load_messages = useCallback(async (conversation_id: string): Promise<void> => {
    set_error(null);
    try {
      const server_messages: MessageResponse[] = await list_messages(conversation_id);
      set_messages(
        server_messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })),
      );
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to load messages");
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
      document_context?: string,
      model_id?: string,
      agent_type?: string,
    ): Promise<void> => {
      if (is_loading) return;

      set_error(null);
      set_is_loading(true);
      set_tool_calls([]);

      // Ensure we have an active conversation.
      let conversation_id = active_conversation_id;
      if (!conversation_id) {
        try {
          const generated_title =
            user_message.length > 40 ? user_message.substring(0, 40) + "..." : user_message;
          const conversation = await create_conversation(document_id, generated_title);
          conversation_id = conversation.id;
          set_conversation(conversation_id);
        } catch (err) {
          set_error(err instanceof Error ? err.message : "Failed to create conversation");
          set_is_loading(false);
          return;
        }
      }

      // Append the user's message to the local chat history.
      const user_msg_id = `user-${Date.now()}`;
      set_messages((prev) => [...prev, { id: user_msg_id, role: "user", content: user_message }]);

      // Append a streaming placeholder for the assistant reply.
      const assistant_placeholder_id = `assistant-streaming-${Date.now()}`;
      streaming_id_ref.current = assistant_placeholder_id;
      set_messages((prev) => [
        ...prev,
        { id: assistant_placeholder_id, role: "assistant", content: "", is_streaming: true },
      ]);

      // Set up cancellation.
      const controller = new AbortController();
      abort_controller_ref.current = controller;

      try {
        const stream = stream_ai_response({
          conversation_id,
          message: user_message,
          document_context,
          model_id,
          agent_type,
          signal: controller.signal,
        });

        for await (const chunk of stream) {
          if (chunk.type === "delta" && chunk.content) {
            const current_streaming_id = streaming_id_ref.current;
            set_messages((prev) =>
              prev.map((msg) =>
                msg.id === current_streaming_id
                  ? { ...msg, content: msg.content + chunk.content }
                  : msg,
              ),
            );
          } else if (chunk.type === "tool_call" && chunk.tool_name) {
            // Accumulate tool names invoked during the agent run.
            set_tool_calls((prev) => [...prev, chunk.tool_name!]);
          } else if (chunk.type === "document_change" && chunk.document_change) {
            // Store the proposed document edit for the accept/reject diff viewer.
            set_pending_document_change(chunk.document_change);
          } else if (chunk.type === "done") {
            const current_streaming_id = streaming_id_ref.current;
            const final_id: string =
              chunk.message_id ?? current_streaming_id ?? crypto.randomUUID();
            set_messages((prev) =>
              prev.map((msg) =>
                msg.id === current_streaming_id
                  ? { ...msg, id: final_id, is_streaming: false }
                  : msg,
              ),
            );
            streaming_id_ref.current = null;
          } else if (chunk.type === "error") {
            set_error(chunk.error ?? "AI service error");
            const current_streaming_id = streaming_id_ref.current;
            set_messages((prev) => prev.filter((msg) => msg.id !== current_streaming_id));
            streaming_id_ref.current = null;
          }
        }

        // If the stream ends without a 'done' chunk, finalise anyway.
        if (streaming_id_ref.current) {
          const current_streaming_id = streaming_id_ref.current;
          set_messages((prev) =>
            prev.map((msg) =>
              msg.id === current_streaming_id ? { ...msg, is_streaming: false } : msg,
            ),
          );
          streaming_id_ref.current = null;
        }
      } catch (err) {
        const current_streaming_id = streaming_id_ref.current;
        if ((err as Error).name === "AbortError") {
          set_messages((prev) =>
            prev.map((msg) =>
              msg.id === current_streaming_id ? { ...msg, is_streaming: false } : msg,
            ),
          );
        } else {
          set_error(err instanceof Error ? err.message : "Streaming failed");
          set_messages((prev) => prev.filter((msg) => msg.id !== current_streaming_id));
        }
        streaming_id_ref.current = null;
      } finally {
        abort_controller_ref.current = null;
        set_is_loading(false);
      }
    },
    [is_loading, active_conversation_id, set_conversation, set_pending_document_change],
  );

  /**
   * Cancel the in-flight streaming request.
   */
  const stop_generating = useCallback(() => {
    abort_controller_ref.current?.abort();
  }, []);

  /**
   * Reset all state for a fresh conversation session.
   */
  const clear = useCallback(() => {
    abort_controller_ref.current?.abort();
    set_messages([]);
    set_error(null);
    set_is_loading(false);
    set_pending_document_change(null);
    set_tool_calls([]);
    streaming_id_ref.current = null;
  }, [set_pending_document_change]);

  /**
   * Clear the pending document change (called after accept or reject).
   */
  const clear_pending_change = useCallback(() => {
    set_pending_document_change(null);
  }, [set_pending_document_change]);

  return {
    messages,
    is_loading,
    error,
    pending_change,
    tool_calls,
    send_message,
    stop_generating,
    load_messages,
    clear,
    clear_pending_change,
  };
}
