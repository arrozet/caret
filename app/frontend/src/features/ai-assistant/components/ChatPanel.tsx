import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, Send, Square, RefreshCw, Sparkles, Check } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { useAiStore } from "../../../stores/aiStore";
import { useAiStream } from "../hooks/useAiStream";
import type { ChatMessage } from "../hooks/useAiStream";
import { deleteConversation, getModels, listConversations } from "../api/aiApi";
import type { ModelInfo } from "../api/aiApi";

const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: "grok-4-1-fast-reasoning",
    name: "Grok 4.1 Fast Reasoning",
    provider: "xAI",
    gateway: "xai",
    is_free: false,
    is_stealth: false,
    context_window: 2_000_000,
    description: "Reasoning-enabled Grok model optimised for agentic tasks.",
  },
  {
    id: "openrouter/healer-alpha",
    name: "Healer Alpha",
    provider: "OpenRouter",
    gateway: "openrouter",
    is_free: true,
    is_stealth: true,
    context_window: 262_144,
    description: "Frontier omni-modal model with strong general capabilities.",
  },
];

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
  toolName: string;
  /** Whether the agent run has finished and this tool call is resolved. */
  isCompleted?: boolean;
}

/**
 * Displays a small pill badge showing a tool name called by the agent.
 * Shows a pulsing dot while the agent is still running, and a checkmark
 * once the run completes.
 */
function ToolCallBadge({ toolName, isCompleted = false }: ToolCallBadgeProps) {
  const label_map_pending: Record<string, string> = {
    get_document_content: "Reading document...",
    propose_document_replacement: "Proposing edit...",
  };
  const label_map_done: Record<string, string> = {
    get_document_content: "Read document",
    propose_document_replacement: "Proposed edit",
  };

  const label = isCompleted
    ? (label_map_done[toolName] ?? `Tool: ${toolName}`)
    : (label_map_pending[toolName] ?? `Tool: ${toolName}...`);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 mb-2 rounded-lg bg-accent-ai/10 border border-accent-ai/25 w-fit text-ui-xs text-accent-ai">
      {isCompleted ? (
        <Check className="h-2.5 w-2.5 shrink-0" aria-hidden="true" strokeWidth={2.5} />
      ) : (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-accent-ai/70 animate-pulse shrink-0"
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
  onSelect: (prompt: string) => void;
}

/**
 * Horizontal strip of quick-action prompt chips shown when there are no
 * messages yet.
 */
function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
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
          onClick={() => onSelect(label)}
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
 *   - Accent colour: accent-ai (#FF4500 light / #FF6B35 dark)
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
    closePanel,
    activeConversationId,
    setConversation,
    aiMode,
    selectedAgentType,
    selectedModelId,
    setAiMode,
    setSelectedModelId,
  } = useAiStore();

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

  const [inputValue, setInputValue] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [recentConversations, setRecentConversations] = useState<
    Array<{ id: string; title: string | null }>
  >([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!selectedModelId) {
      setSelectedModelId("grok-4-1-fast-reasoning");
    }
  }, [selectedModelId, setSelectedModelId]);

  // Fetch available models on mount and pre-select the server default.
  useEffect(() => {
    getModels()
      .then((res) => {
        setModels(res.models);
        const fallbackDefaultId =
          res.models.find((model) => model.id === "grok-4-1-fast-reasoning")?.id ??
          res.models[0]?.id;
        const defaultId = res.default_model_id ?? fallbackDefaultId;

        if (!defaultId) {
          return;
        }

        // If current selection is missing from the catalog (e.g. stale store),
        // force it back to a valid option so the selector is always usable.
        const isCurrentSelectionValid =
          selectedModelId !== undefined && res.models.some((model) => model.id === selectedModelId);

        if (!isCurrentSelectionValid) {
          setSelectedModelId(defaultId);
        }
      })
      .catch(() => {
        // Keep fallback selector options available when catalog fetch fails.
        setModels([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectableModels = models.length > 0 ? models : FALLBACK_MODELS;

  // Load existing messages when panel opens with a pre-existing conversation.
  useEffect(() => {
    if (activeConversationId && messages.length === 0) {
      load_messages(activeConversationId);
    }
  }, [activeConversationId, load_messages, messages.length]);

  const loadRecentConversations = useCallback(async () => {
    try {
      const response = await listConversations(document_id);
      setRecentConversations(response.items.map((item) => ({ id: item.id, title: item.title })));
    } catch {
      setRecentConversations([]);
    }
  }, [document_id]);

  useEffect(() => {
    loadRecentConversations();
  }, [loadRecentConversations]);

  useEffect(() => {
    if (messages.length > 0) {
      loadRecentConversations();
    }
  }, [messages.length, loadRecentConversations]);

  // Handle manual scroll to detect if user scrolled up.
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    isUserScrolling.current = !isAtBottom;
  }, []);

  // Auto-scroll to the bottom whenever messages update.
  useEffect(() => {
    if (!isUserScrolling.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Focus the text input when the panel mounts.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /**
   * Handle send button / Enter key press.
   * Reads the document context fresh via the callback so the AI always
   * receives the current document state at the exact moment of sending.
   */
  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || is_loading) return;
    setInputValue("");
    isUserScrolling.current = false;
    const agentTypeToUse = aiMode === "agent" ? selectedAgentType : undefined;
    const currentContext = get_document_context?.();
    await send_message(trimmed, document_id, currentContext, selectedModelId, agentTypeToUse);
  }, [
    inputValue,
    is_loading,
    send_message,
    document_id,
    get_document_context,
    selectedModelId,
    aiMode,
    selectedAgentType,
  ]);

  /**
   * Allow Shift+Enter for newlines; Enter alone sends the message.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  /**
   * Handle a suggested prompt chip click — send immediately with fresh context.
   */
  const handleSuggestedPrompt = useCallback(
    async (prompt: string) => {
      setInputValue("");
      const agentTypeToUse = aiMode === "agent" ? selectedAgentType : undefined;
      const currentContext = get_document_context?.();
      await send_message(prompt, document_id, currentContext, selectedModelId, agentTypeToUse);
    },
    [send_message, document_id, get_document_context, selectedModelId, aiMode, selectedAgentType],
  );

  /**
   * Close the panel and return focus to the editor.
   */
  const handleClose = useCallback(() => {
    closePanel();
  }, [closePanel]);

  /**
   * Start a new conversation: clear local state and reset active conversation.
   */
  const handleNewConversation = useCallback(async () => {
    if (activeConversationId) {
      deleteConversation(activeConversationId).catch(() => undefined);
    }
    setConversation(null);
    clear();
    setRecentConversations((prev) => prev.filter((item) => item.id !== activeConversationId));
  }, [activeConversationId, setConversation, clear]);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      if (conversationId === activeConversationId) return;
      setConversation(conversationId);
      clear();
      await load_messages(conversationId);
    },
    [activeConversationId, setConversation, clear, load_messages],
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
              onClick={handleNewConversation}
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
            ref={closeButtonRef}
            variant="ghost"
            size="sm"
            onClick={handleClose}
            aria-label={t("close_panel")}
            className="p-1.5"
          >
            <X className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
          </Button>
        </div>
      </div>

      {/* Message list — scrollable, aria-live for screen readers */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
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
            <SuggestedPrompts onSelect={handleSuggestedPrompt} />
            {recentConversations.length > 0 && (
              <div className="mt-4 w-full px-4">
                <p className="mb-2 text-ui-xs font-medium text-text-secondary/80">
                  Recent conversations
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {recentConversations.slice(0, 5).map((conversation, index) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => handleSelectConversation(conversation.id)}
                      className={[
                        "shrink-0 min-w-[120px] max-w-[150px] rounded-lg border px-3 py-2 text-left text-ui-sm transition-colors truncate",
                        conversation.id === activeConversationId
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
            {aiMode === "agent" && tool_calls.length > 0 && (
              <div className="px-2 py-1 mb-1">
                {tool_calls.map((toolName: string, idx: number) => (
                  <ToolCallBadge
                    key={`${toolName}-${idx}`}
                    toolName={toolName}
                    isCompleted={!is_loading}
                  />
                ))}
              </div>
            )}
            {/* Anchor element for auto-scroll */}
            <div ref={messagesEndRef} />
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
            onClick={() => setAiMode("ask")}
            className={[
              "px-2.5 py-1 rounded-md text-ui-xs font-medium transition-all duration-150",
              aiMode === "ask"
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            Ask
          </button>
          <button
            onClick={() => setAiMode("agent")}
            className={[
              "px-2.5 py-1 rounded-md text-ui-xs font-medium transition-all duration-150",
              aiMode === "agent"
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            Agent
          </button>
        </div>

        <select
          id="model-selector"
          value={selectedModelId ?? ""}
          onChange={(e) => setSelectedModelId(e.target.value || undefined)}
          aria-label={t("model_selector")}
          className="flex-1 min-w-0 rounded-[4px] border border-border-subtle bg-app px-2 py-1 text-ui-xs text-text-primary outline-none focus:border-accent-ai transition-colors duration-100"
        >
          {selectableModels.some((m) => m.is_free) && (
            <optgroup label={t("model_group_free")}>
              {selectableModels
                .filter((m) => m.is_free)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </optgroup>
          )}
          {selectableModels.some((m) => !m.is_free) && (
            <optgroup label={t("model_group_paid")}>
              {selectableModels
                .filter((m) => !m.is_free)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border-subtle px-4 pb-4 pt-3 bg-surface">
        <div className="flex items-end gap-2 rounded-xl border border-border-subtle bg-app px-3 py-2.5 focus-within:border-accent-ai focus-within:ring-1 focus-within:ring-accent-ai/20 transition-all duration-200 shadow-sm">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
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
              onClick={handleSend}
              disabled={!inputValue.trim()}
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
