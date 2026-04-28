import { supabase_client } from "../../../lib/supabase";
import { api_fetch } from "../../../lib/apiClient";

/**
 * Base URL for AI service endpoints.
 * All AI routes are prefixed with /ai relative to the api_fetch base URL.
 */
const AI_BASE = "/ai";

/** Base URL for embedding service endpoints behind the AI gateway prefix. */
const EMBEDDINGS_BASE = `${AI_BASE}/embeddings`;

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

/** Compact conversation entry used by the recent-conversations list. */
export interface ConversationListItemResponse {
  /** Conversation UUID. */
  id: string;
  /** Document this conversation belongs to. */
  document_id: string;
  /** Optional display title. */
  title: string | null;
  /** ISO 8601 creation timestamp. */
  created_at: string;
  /** ISO 8601 last-update timestamp. */
  updated_at: string;
}

/** Paginated list envelope for conversations. */
export interface ConversationListResponse {
  /** Ordered conversations (newest first). */
  items: ConversationListItemResponse[];
  /** Total count available server-side. */
  total: number;
}

export interface MessageResponse {
  /** Message UUID. */
  id: string;
  /** Parent conversation UUID. */
  conversation_id: string;
  /** Sender role: "user" or "assistant". */
  role: "user" | "assistant";
  /** Message text content. */
  content: string;
  /** Ordered tool names used by the assistant for this reply. */
  tool_calls: string[];
  /** ISO 8601 creation timestamp. */
  created_at: string;
}

/** Paginated list envelope for messages. */
export interface MessageListResponse {
  /** Ordered messages (oldest first). */
  items: MessageResponse[];
  /** Total count available server-side. */
  total: number;
}

/** A proposed document edit emitted by the agentic AI. */
export interface DocumentChangePayload {
  /** Edit operation type. Currently only "replace_full" is supported. */
  operation: string;
  /** Full replacement document text proposed by the agent. */
  proposed_text: string;
  /** Document text at invocation time (for diffing). */
  original_text: string;
  /** Optional start position for range-scoped edits. */
  position_start?: number | null;
  /** Optional end position for range-scoped edits. */
  position_end?: number | null;
}

/** Structured snapshot of the live editor document context. */
export interface DocumentContextSnapshot {
  /** Serialized ProseMirror/Tiptap document JSON. */
  content_json: unknown;
  /** Plain-text rendering of the same document. */
  content_text: string;
  /** Optional live selection range, when the editor has an active selection. */
  selection?: {
    from: number;
    to: number;
    text: string;
  };
}

/**
 * A parsed SSE chunk from the AI streaming endpoint.
 * The backend emits newline-delimited JSON objects in the event data.
 */
export interface StreamChunk {
  /** The type of event. */
  type: "delta" | "done" | "error" | "document_change" | "tool_call";
  /** Partial text content (present when type === "delta"). */
  content?: string;
  /** Error message (present when type === "error"). */
  error?: string;
  /** Final full message ID assigned by the backend (present when type === "done"). */
  message_id?: string;
  /** Populated on "document_change" events — contains the proposed document edit. */
  document_change?: DocumentChangePayload;
  /** Set on "tool_call" events — the name of the tool being invoked. */
  tool_name?: string;
}

/** A single selectable LLM model returned by GET /ai/models. */
export interface ModelInfo {
  /** Model slug used when calling the target gateway. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Upstream provider name. */
  provider: string;
  /** Which upstream API endpoint handles this model (catalog uses OpenRouter). */
  gateway: "openrouter";
  /** True when the model has no API cost. */
  is_free: boolean;
  /**
   * True when the AI lab behind the model has not been publicly disclosed.
   * These are anonymous releases on OpenRouter where the real creator is unknown.
   */
  is_stealth: boolean;
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
export function getModels(): Promise<ModelsResponse> {
  return api_fetch<ModelsResponse>(`${AI_BASE}/models`);
}

/**
 * Create a new AI conversation for a document.
 * @param document_id - UUID of the document to associate the conversation with.
 * @returns The newly created conversation.
 */
export function createConversation(
  document_id: string,
  title?: string,
): Promise<ConversationResponse> {
  return api_fetch<ConversationResponse>(`${AI_BASE}/conversations`, {
    method: "POST",
    body: JSON.stringify({ document_id, title }),
  });
}

/**
 * List persisted conversations for a specific document.
 * @param document_id - Document UUID.
 * @returns Conversation list ordered by most recent activity.
 */
export function listConversations(document_id: string): Promise<ConversationListResponse> {
  const query = new URLSearchParams({ document_id }).toString();
  return api_fetch<ConversationListResponse>(`${AI_BASE}/conversations?${query}`);
}

/**
 * Fetch all messages in a conversation.
 * @param conversation_id - Conversation UUID.
 * @returns Ordered array of messages (oldest first).
 */
export function listMessages(conversation_id: string): Promise<MessageResponse[]> {
  return api_fetch<MessageListResponse>(
    `${AI_BASE}/conversations/${conversation_id}/messages`,
  ).then((response) => response.items);
}

/**
 * Delete an AI conversation and all its messages.
 * @param conversation_id - Conversation UUID.
 */
export function deleteConversation(conversation_id: string): Promise<void> {
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
  /** Active document UUID, used for document-scoped retrieval/context. */
  document_id: string;
  /** The user message text to send. */
  message: string;
  /** Optional document snapshot for context. */
  document_context?: string | DocumentContextSnapshot;
  /** Optional OpenRouter model slug to use for this request. */
  model_id?: string;
  /**
   * Optional agent type slug (e.g. "general"). When provided, the backend
   * uses the agentic mode with document read/edit tools instead of plain chat.
   */
  agent_type?: string;
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
export async function* streamAiResponse(
  options: StreamRequestOptions,
): AsyncGenerator<StreamChunk> {
  const { conversation_id, document_id, message, document_context, model_id, agent_type, signal } =
    options;

  // Retrieve the current auth session to attach the Bearer token.
  const {
    data: { session },
  } = await supabase_client.auth.getSession();

  const api_base = (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:3000/api/v1";

  const response = await fetch(`${api_base}${AI_BASE}/conversations/${conversation_id}/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ message, document_context, model_id, document_id, agent_type }),
    signal,
  });

  if (!response.ok) {
    const error_body = await response.json().catch(() => ({}));
    const message_text =
      (error_body as { error?: string }).error || `AI stream error: ${response.status}`;
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
        const data_line = event.split("\n").find((line) => line.startsWith("data:"));

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

// ---------------------------------------------------------------------------
// Embedding / RAG
// ---------------------------------------------------------------------------

/** Response from the embedding index endpoint. */
export interface IndexEmbeddingsResponse {
  /** UUID of the document that was indexed. */
  document_id: string;
  /** Number of chunks that were embedded and stored. */
  chunks_indexed: number;
}

/**
 * Index (or re-index) a document's content into the vector store.
 *
 * Splits the plain-text content into overlapping chunks, embeds each chunk
 * via the AI service, and stores the result in `document_embeddings`.
 * Safe to call repeatedly — existing embeddings for the document are
 * replaced atomically.
 *
 * @param document_id - UUID of the document to index.
 * @param content - Plain-text content of the document.
 * @returns Summary of the indexing operation.
 */
export function indexDocumentEmbeddings(
  document_id: string,
  content: string,
): Promise<IndexEmbeddingsResponse> {
  return api_fetch<IndexEmbeddingsResponse>(`${EMBEDDINGS_BASE}/index`, {
    method: "POST",
    body: JSON.stringify({ document_id, content }),
  });
}
