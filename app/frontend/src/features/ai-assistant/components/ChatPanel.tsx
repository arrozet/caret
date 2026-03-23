import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, Send, Square, RefreshCw, Sparkles, Check } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { use_ai_store } from "../../../stores/ai_store";
import { useAiStream } from "../hooks/use_ai_stream";
import type { ChatMessage } from "../hooks/use_ai_stream";
import { delete_conversation, get_models, list_conversations } from "../api/ai_api";
import type { ModelInfo } from "../api/ai_api";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Props for a single rendered chat message bubble.
 */
interface MessageBubbleProps {
  /** The message to render. */
  message: ChatMessage;
}

/**
 * Renders a single chat message bubble.
 * User messages are right-aligned; assistant messages are left-aligned.
 */
function MessageBubble({ message }: MessageBubbleProps) {
  const is_user = message.role === "user";

  // Parse <think>...</think> if present (common in models like DeepSeek-R1)
  let think_content = null;
  let main_content = message.content;

  const think_match = message.content.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
  if (think_match) {
    think_content = think_match[1].trim();
    main_content = message.content.replace(/<think>[\s\S]*?(?:<\/think>|$)/, "").trim();
  }

  const is_animating = message.role === "assistant" && message.is_streaming === true;

  return (
    <div className={`flex w-full ${is_user ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={[
          "max-w-[85%] px-4 py-2.5 text-ui-sm leading-relaxed transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-2",
          is_user
            ? "bg-accent-ai text-white rounded-2xl rounded-br-sm shadow-sm"
            : "bg-surface border border-border-subtle text-text-primary rounded-2xl rounded-bl-sm shadow-sm flex flex-col gap-1.5",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Render AI thoughts if present */}
        {think_content && (
          <div className="pl-3 py-0.5 border-l-[3px] border-border-subtle/70 text-text-secondary/80 text-ui-xs">
            {think_content || "Pensando..."}
          </div>
        )}

        {/* Render main content */}
        <div className="whitespace-pre-wrap break-words">
          {main_content}
          {/* Animated typing cursor */}
          {is_animating && (
            <span
              className="ml-1.5 inline-block h-2 w-2 rounded-full bg-current opacity-60 animate-[pulse_1s_cubic-bezier(0.4,0,0.6,1)_infinite] align-middle shadow-sm"
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool call badge
// ---------------------------------------------------------------------------

/**
 * Props for a single tool call badge shown during/after an agent run.
 */
interface ToolCallBadgeProps {
  /** The name of the tool that was called. */
  tool_name: string;
  /** Whether the agent run has finished and this tool call is resolved. */
  is_completed?: boolean;
}

/**
 * Displays a small pill badge showing a tool name called by the agent.
 * Shows a pulsing dot while the agent is still running, and a checkmark
 * once the run completes.
 */
function ToolCallBadge({ tool_name, is_completed = false }: ToolCallBadgeProps) {
  const label_map_pending: Record<string, string> = {
    get_document_content: "Reading document...",
    propose_document_replacement: "Proposing edit...",
  };
  const label_map_done: Record<string, string> = {
    get_document_content: "Read document",
    propose_document_replacement: "Proposed edit",
  };

  const label = is_completed
    ? (label_map_done[tool_name] ?? `Tool: ${tool_name}`)
    : (label_map_pending[tool_name] ?? `Tool: ${tool_name}...`);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 mb-2 rounded-lg bg-accent-ai/8 border border-accent-ai/20 w-fit text-ui-xs text-accent-ai">
      {is_completed ? (
        <Check className="h-2.5 w-2.5 shrink-0" aria-hidden="true" strokeWidth={2.5} />
      ) : (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-accent-ai/60 animate-pulse shrink-0"
          aria-hidden="true"
        />
      )}
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggested prompts strip
// ---------------------------------------------------------------------------

/**
 * Props for the suggested prompts strip shown in the empty state.
 */
interface SuggestedPromptsProps {
  /** Called when the user clicks a prompt chip. */
  on_select: (prompt: string) => void;
}

/**
 * Horizontal strip of quick-action prompt chips shown when there are no
 * messages yet.
 */
function SuggestedPrompts({ on_select }: SuggestedPromptsProps) {
  const { t } = useTranslation("ai");

  const prompts: Array<{ key: string; label: string }> = [
    { key: "summarize", label: t("suggested_prompts.summarize") },
    { key: "improve_intro", label: t("suggested_prompts.improve_intro") },
    { key: "check_clarity", label: t("suggested_prompts.check_clarity") },
  ];

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      {prompts.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => on_select(label)}
          className="w-full text-left rounded-xl px-4 py-2.5 text-ui-sm text-text-secondary border border-border-subtle hover:border-accent-ai hover:text-accent-ai hover:bg-surface transition-all duration-200 ease-out shadow-sm hover:shadow"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ChatPanel
// ---------------------------------------------------------------------------

/**
 * Props for the ChatPanel component.
 */
interface ChatPanelProps {
  /**
   * UUID of the document currently open in the editor.
   * Used when creating a new AI conversation.
   */
  document_id: string;
  /**
   * Callback that returns the current plain-text content of the editor on
   * demand. Called immediately before each message is sent so the AI always
   * receives an up-to-date document snapshot, regardless of when the panel
   * was opened or how the document has changed since.
   */
  get_document_context?: () => string | undefined;
  /**
   * Increment this token whenever the parent resolves a pending change.
   * The panel will clear its local pending state when this value changes.
   */
  resolve_pending_change_token?: number;
}

/**
 * AI Chat Panel — 400px fixed right sidebar.
 *
 * Displays the Caret AI conversation history and a message input box.
 * Streamed responses appear incrementally as they arrive via SSE.
 * In Agent mode the panel exposes tool call traces and forwards proposed
 * document edits to the editor-area review overlay.
 *
 * Design tokens:
 *   - Accent colour: accent-ai (#8B5CF6 light / #A78BFA dark)
 *   - Panel width: 400px (w-[400px])
 *   - Z-index: 40 (floating UI layer per FRONTEND.md z-index table)
 */
export function ChatPanel({
  document_id,
  get_document_context,
  resolve_pending_change_token,
}: ChatPanelProps) {
  const { t } = useTranslation("ai");

  const {
    close_panel,
    active_conversation_id,
    set_conversation,
    ai_mode,
    selected_agent_type,
    selected_model_id,
    set_ai_mode,
    set_selected_model_id,
  } = use_ai_store();

  const {
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
  } = useAiStream();

  const [input_value, set_input_value] = useState("");
  const [models, set_models] = useState<ModelInfo[]>([]);
  const [recent_conversations, set_recent_conversations] = useState<
    Array<{ id: string; title: string | null }>
  >([]);
  const messages_end_ref = useRef<HTMLDivElement>(null);
  const messages_container_ref = useRef<HTMLDivElement>(null);
  const is_user_scrolling = useRef(false);
  const input_ref = useRef<HTMLTextAreaElement>(null);
  const close_button_ref = useRef<HTMLButtonElement>(null);

  // Fetch available models on mount and pre-select the server default.
  useEffect(() => {
    get_models()
      .then((res) => {
        set_models(res.models);
        const default_id = res.default_model_id ?? res.models[0]?.id;
        if (default_id && !selected_model_id) set_selected_model_id(default_id);
      })
      .catch(() => {
        // Silently fall back — the backend uses its configured default.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load existing messages when panel opens with a pre-existing conversation.
  useEffect(() => {
    if (active_conversation_id && messages.length === 0) {
      load_messages(active_conversation_id);
    }
  }, [active_conversation_id, load_messages, messages.length]);

  const load_recent_conversations = useCallback(async () => {
    try {
      const response = await list_conversations(document_id);
      set_recent_conversations(response.items.map((item) => ({ id: item.id, title: item.title })));
    } catch {
      set_recent_conversations([]);
    }
  }, [document_id]);

  useEffect(() => {
    load_recent_conversations();
  }, [load_recent_conversations]);

  useEffect(() => {
    if (messages.length > 0) {
      load_recent_conversations();
    }
  }, [messages.length, load_recent_conversations]);

  // Handle manual scroll to detect if user scrolled up.
  const handle_scroll = useCallback(() => {
    if (!messages_container_ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messages_container_ref.current;
    const is_at_bottom = scrollHeight - scrollTop - clientHeight < 50;
    is_user_scrolling.current = !is_at_bottom;
  }, []);

  // Auto-scroll to the bottom whenever messages update.
  useEffect(() => {
    if (!is_user_scrolling.current) {
      messages_end_ref.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Focus the text input when the panel mounts.
  useEffect(() => {
    input_ref.current?.focus();
  }, []);

  /**
   * Handle send button / Enter key press.
   * Reads the document context fresh via the callback so the AI always
   * receives the current document state at the exact moment of sending.
   */
  const handle_send = useCallback(async () => {
    const trimmed = input_value.trim();
    if (!trimmed || is_loading) return;
    set_input_value("");
    is_user_scrolling.current = false;
    const agent_type_to_use = ai_mode === "agent" ? selected_agent_type : undefined;
    const current_context = get_document_context?.();
    await send_message(trimmed, document_id, current_context, selected_model_id, agent_type_to_use);
  }, [
    input_value,
    is_loading,
    send_message,
    document_id,
    get_document_context,
    selected_model_id,
    ai_mode,
    selected_agent_type,
  ]);

  /**
   * Allow Shift+Enter for newlines; Enter alone sends the message.
   */
  const handle_key_down = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handle_send();
      }
    },
    [handle_send],
  );

  /**
   * Handle a suggested prompt chip click — send immediately with fresh context.
   */
  const handle_suggested_prompt = useCallback(
    async (prompt: string) => {
      set_input_value("");
      const agent_type_to_use = ai_mode === "agent" ? selected_agent_type : undefined;
      const current_context = get_document_context?.();
      await send_message(
        prompt,
        document_id,
        current_context,
        selected_model_id,
        agent_type_to_use,
      );
    },
    [
      send_message,
      document_id,
      get_document_context,
      selected_model_id,
      ai_mode,
      selected_agent_type,
    ],
  );

  /**
   * Close the panel and return focus to the editor.
   */
  const handle_close = useCallback(() => {
    close_panel();
  }, [close_panel]);

  /**
   * Start a new conversation: clear local state and reset active conversation.
   */
  const handle_new_conversation = useCallback(async () => {
    if (active_conversation_id) {
      delete_conversation(active_conversation_id).catch(() => undefined);
    }
    set_conversation(null);
    clear();
    set_recent_conversations((prev) => prev.filter((item) => item.id !== active_conversation_id));
  }, [active_conversation_id, set_conversation, clear]);

  const handle_select_conversation = useCallback(
    async (conversation_id: string) => {
      if (conversation_id === active_conversation_id) return;
      set_conversation(conversation_id);
      clear();
      await load_messages(conversation_id);
    },
    [active_conversation_id, set_conversation, clear, load_messages],
  );

  /**
   * Allow parent-owned accept/reject controls (outside this panel) to clear
   * the pending change stored in the streaming hook.
   */
  const last_resolve_token_ref = useRef<number | undefined>(resolve_pending_change_token);
  useEffect(() => {
    if (resolve_pending_change_token === undefined) return;
    if (last_resolve_token_ref.current === undefined) {
      last_resolve_token_ref.current = resolve_pending_change_token;
      return;
    }
    if (resolve_pending_change_token !== last_resolve_token_ref.current) {
      clear_pending_change();
      last_resolve_token_ref.current = resolve_pending_change_token;
    }
  }, [resolve_pending_change_token, clear_pending_change]);

  const has_messages = messages.length > 0;

  return (
    <aside
      className="flex w-[400px] shrink-0 flex-col border-l border-border-subtle bg-surface z-40 shadow-[-4px_0_24px_-8px_rgba(0,0,0,0.05)] transition-all duration-300 ease-in-out self-stretch"
      aria-label={t("panel_title")}
      role="complementary"
    >
      {/* Panel header */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-ai" aria-hidden="true" strokeWidth={2} />
          <span className="text-ui-base font-semibold text-text-primary">{t("panel_title")}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* New conversation button — only shown when messages exist */}
          {has_messages && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handle_new_conversation}
              disabled={is_loading}
              aria-label={t("new_conversation")}
              title={t("new_conversation")}
              className="p-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
            </Button>
          )}

          {/* Close panel */}
          <Button
            ref={close_button_ref}
            variant="ghost"
            size="sm"
            onClick={handle_close}
            aria-label={t("close_panel")}
            className="p-1.5"
          >
            <X className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
          </Button>
        </div>
      </div>

      {/* Message list — scrollable, aria-live for screen readers */}
      <div
        ref={messages_container_ref}
        onScroll={handle_scroll}
        className="flex-1 overflow-y-auto px-2 py-3 min-h-0"
        role="log"
        aria-live="polite"
        aria-label={t("messages_region")}
      >
        {!has_messages && (
          <div className="flex flex-col items-center justify-center h-full min-h-[120px]">
            <p className="text-ui-sm text-text-secondary mb-4 px-4 text-center">
              {t("empty_state")}
            </p>
            <SuggestedPrompts on_select={handle_suggested_prompt} />
            {recent_conversations.length > 0 && (
              <div className="mt-4 w-full px-4">
                <p className="mb-2 text-ui-xs font-medium text-text-secondary/80">
                  Recent conversations
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {recent_conversations.slice(0, 5).map((conversation, index) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => handle_select_conversation(conversation.id)}
                      className={[
                        "shrink-0 min-w-[120px] max-w-[150px] rounded-lg border px-3 py-2 text-left text-ui-sm transition-colors truncate",
                        conversation.id === active_conversation_id
                          ? "border-accent-ai/50 bg-accent-ai/5 text-text-primary"
                          : "border-border-subtle text-text-secondary hover:border-accent-ai/40 hover:text-text-primary",
                      ].join(" ")}
                      title={
                        conversation.title && conversation.title.trim().length > 0
                          ? conversation.title
                          : `Conversation ${index + 1}`
                      }
                    >
                      {conversation.title && conversation.title.trim().length > 0
                        ? conversation.title
                        : `Conversation ${index + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {has_messages && (
          <div className="flex flex-col">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {/* Tool call trace — shown in agent mode during/after an agentic run */}
            {ai_mode === "agent" && tool_calls.length > 0 && (
              <div className="px-2 py-1 mb-1">
                {tool_calls.map((tool_name, idx) => (
                  <ToolCallBadge
                    key={`${tool_name}-${idx}`}
                    tool_name={tool_name}
                    is_completed={!is_loading}
                  />
                ))}
              </div>
            )}
            {/* Anchor element for auto-scroll */}
            <div ref={messages_end_ref} />
          </div>
        )}
      </div>

      {/* Pending change hint — actual review UI lives over the document canvas */}
      {pending_change !== null && (
        <div className="mx-3 mb-2 rounded-lg border border-accent-ai/30 bg-accent-ai/5 px-3 py-2 text-ui-xs text-accent-ai">
          Proposed edit ready. Review and accept/reject it in the document area.
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mx-3 mb-2 rounded-[4px] bg-error/10 border border-error/30 px-3 py-2 text-ui-sm text-error"
        >
          {t("error.unavailable")}
        </div>
      )}

      {/* Bottom controls: Ask/Agent toggle + model selector — same row */}
      <div className="shrink-0 px-3 py-2 border-t border-border-subtle bg-surface flex items-center gap-2">
        {/* Ask / Agent mode toggle */}
        <div className="flex items-center gap-0.5 bg-app rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => set_ai_mode("ask")}
            className={[
              "px-2.5 py-1 rounded-md text-ui-xs font-medium transition-all duration-150",
              ai_mode === "ask"
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            Ask
          </button>
          <button
            onClick={() => set_ai_mode("agent")}
            className={[
              "px-2.5 py-1 rounded-md text-ui-xs font-medium transition-all duration-150",
              ai_mode === "agent"
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            Agent
          </button>
        </div>

        {/* Model selector — only when more than one model is available */}
        {models.length > 1 && (
          <select
            id="model-selector"
            value={selected_model_id ?? ""}
            onChange={(e) => set_selected_model_id(e.target.value || undefined)}
            aria-label={t("model_selector")}
            className="flex-1 min-w-0 rounded-[4px] border border-border-subtle bg-app px-2 py-1 text-ui-xs text-text-primary outline-none focus:border-accent-ai transition-colors duration-100"
          >
            {models.some((m) => m.is_free) && (
              <optgroup label={t("model_group_free")}>
                {models
                  .filter((m) => m.is_free)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </optgroup>
            )}
            {models.some((m) => !m.is_free) && (
              <optgroup label={t("model_group_paid")}>
                {models
                  .filter((m) => !m.is_free)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border-subtle px-4 pb-4 pt-3 bg-surface">
        <div className="flex items-end gap-2 rounded-xl border border-border-subtle bg-app px-3 py-2.5 focus-within:border-accent-ai focus-within:ring-1 focus-within:ring-accent-ai/20 transition-all duration-200 shadow-sm">
          <textarea
            ref={input_ref}
            value={input_value}
            onChange={(e) => set_input_value(e.target.value)}
            onKeyDown={handle_key_down}
            placeholder={t("input_placeholder")}
            disabled={is_loading}
            rows={1}
            className="flex-1 resize-none bg-transparent text-ui-sm text-text-primary placeholder:text-text-secondary/60 outline-none leading-relaxed max-h-[120px] overflow-y-auto disabled:opacity-50 py-0.5"
            aria-label={t("input_placeholder")}
            style={{
              height: "auto",
            }}
            onInput={(e) => {
              const target = e.currentTarget;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
          />

          {is_loading ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={stop_generating}
              aria-label={t("stop_generating")}
              className="shrink-0 p-1.5 text-accent-ai hover:text-accent-ai/80"
            >
              <Square className="h-4 w-4 fill-current" aria-hidden="true" strokeWidth={0} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handle_send}
              disabled={!input_value.trim()}
              aria-label="Send message"
              className="shrink-0 p-1.5 text-accent-ai hover:text-accent-ai/80 disabled:text-text-secondary/40"
            >
              <Send className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            </Button>
          )}
        </div>

        {/* Keyboard shortcut hint */}
        <p className="mt-1.5 text-center text-ui-xs text-text-secondary/50">{t("keyboard_hint")}</p>
      </div>
    </aside>
  );
}
