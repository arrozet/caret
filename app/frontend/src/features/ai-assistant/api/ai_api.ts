import { supabase_client } from "../../../lib/supabase";
import { api_fetch } from "../../../lib/api_client";

/**
 * Base URL for AI service endpoints.
 * All AI routes are prefixed with /ai relative to the api_fetch base URL.
 */
const AI_BASE = "/ai";

// ---------------------------------------------------------------------------
// Response shape types (mirrors the Python Pydantic DTOs)
// ---------------------------------------------------------------------------

/** A single AI conversation. */
export interface ConversationResponse {
  /** Conversation UUID. */
  id: string;
  /** Document this conversation belongs to. */
  document_id: string;
  /** User who owns this conversation. */
  user_id: string;
  /** Conversation display title (auto-generated from first message). */
  title: string | null;
  /** ISO 8601 creation timestamp. */
  created_at: string;
  /** ISO 8601 last-update timestamp. */
  updated_at: string;
}

/** A single chat message within a conversation. */
export interface MessageResponse {
  /** Message UUID. */
  id: string;
  /** Parent conversation UUID. */
  conversation_id: string;
  /** Sender role: "user" or "assistant". */
  role: "user" | "assistant";
  /** Message text content. */
  content: string;
  /** ISO 8601 creation timestamp. */
  created_at: string;
}

/**
 * A parsed SSE chunk from the AI streaming endpoint.
 * The backend emits newline-delimited JSON objects in the event data.
 */
export interface StreamChunk {
  /** The type of event: "delta" for partial text, "done" when finished, "error" on failure. */
  type: "delta" | "done" | "error";
  /** Partial text content (present when type === "delta"). */
  content?: string;
  /** Error message (present when type === "error"). */
  error?: string;
  /** Final full message ID assigned by the backend (present when type === "done"). */
  message_id?: string;
}

/** A single selectable LLM model returned by GET /ai/models. */
export interface ModelInfo {
  /** OpenRouter model slug, e.g. 'z-ai/glm-4.5-air:free'. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Upstream provider name. */
  provider: string;
  /** True when the model has no API cost on OpenRouter. */
  is_free: boolean;
  /** Maximum context window in tokens. */
  context_window: number;
  /** Short one-line description. */
  description: string;
}

/** Response body for GET /ai/models. */
export interface ModelsResponse {
  models: ModelInfo[];
  default_model_id: string;
}

// ---------------------------------------------------------------------------
// REST API functions
// ---------------------------------------------------------------------------

/**
 * Fetch the curated list of available LLM models.
 * @returns ModelsResponse with the model list and the server default model id.
 */
export function get_models(): Promise<ModelsResponse> {
  return api_fetch<ModelsResponse>(`${AI_BASE}/models`);
}

/**
 * Create a new AI conversation for a document.
 * @param document_id - UUID of the document to associate the conversation with.
 * @returns The newly created conversation.
 */
export function create_conversation(
  document_id: string,
): Promise<ConversationResponse> {
  return api_fetch<ConversationResponse>(`${AI_BASE}/conversations`, {
    method: "POST",
    body: JSON.stringify({ document_id }),
  });
}

/**
 * Fetch all messages in a conversation.
 * @param conversation_id - Conversation UUID.
 * @returns Ordered array of messages (oldest first).
 */
export function list_messages(
  conversation_id: string,
): Promise<MessageResponse[]> {
  return api_fetch<MessageResponse[]>(
    `${AI_BASE}/conversations/${conversation_id}/messages`,
  );
}

/**
 * Delete an AI conversation and all its messages.
 * @param conversation_id - Conversation UUID.
 */
export function delete_conversation(conversation_id: string): Promise<void> {
  return api_fetch<void>(`${AI_BASE}/conversations/${conversation_id}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

/**
 * Options for streaming an AI response.
 */
export interface StreamRequestOptions {
  /** Conversation UUID to stream into. */
  conversation_id: string;
  /** The user message text to send. */
  message: string;
  /** Optional plain-text snapshot of the document for context. */
  document_context?: string;
  /** Optional OpenRouter model slug to use for this request. */
  model_id?: string;
  /** AbortSignal to cancel the stream. */
  signal?: AbortSignal;
}

/**
 * Stream an AI response via Server-Sent Events.
 *
 * Sends a POST request to the streaming endpoint and returns an async
 * generator that yields parsed StreamChunk objects as they arrive.
 *
 * The generator completes when a "done" or "error" chunk is received,
 * or when the request is aborted via the provided signal.
 *
 * @param options - Stream request options.
 * @yields Parsed StreamChunk objects.
 * @throws Error if the initial HTTP response is not OK.
 */
export async function* stream_ai_response(
  options: StreamRequestOptions,
): AsyncGenerator<StreamChunk> {
  const { conversation_id, message, document_context, model_id, signal } = options;

  // Retrieve the current auth session to attach the Bearer token.
  const {
    data: { session },
  } = await supabase_client.auth.getSession();

  const api_base =
    (import.meta.env.VITE_API_BASE_URL as string) ||
    "http://localhost:3000/api/v1";

  const response = await fetch(
    `${api_base}${AI_BASE}/conversations/${conversation_id}/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({ message, document_context, model_id }),
      signal,
    },
  );

  if (!response.ok) {
    const error_body = await response.json().catch(() => ({}));
    const message_text =
      (error_body as { error?: string }).error ||
      `AI stream error: ${response.status}`;
    throw new Error(message_text);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode the incoming bytes and append to the line buffer.
      buffer += decoder.decode(value, { stream: true });

      // SSE lines are separated by "\n\n"; split and process complete events.
      const events = buffer.split("\n\n");
      // Keep the last (potentially incomplete) segment in the buffer.
      buffer = events.pop() ?? "";

      for (const event of events) {
        // Each SSE event may contain multiple lines; find the "data:" line.
        const data_line = event
          .split("\n")
          .find((line) => line.startsWith("data:"));

        if (!data_line) continue;

        const json_str = data_line.slice("data:".length).trim();
        if (!json_str) continue;

        let chunk: StreamChunk;
        try {
          chunk = JSON.parse(json_str) as StreamChunk;
        } catch {
          // Skip malformed JSON frames.
          continue;
        }

        yield chunk;

        // Stop consuming once the stream signals completion or an error.
        if (chunk.type === "done" || chunk.type === "error") {
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
