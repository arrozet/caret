import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  X,
  Send,
  Square,
  RefreshCw,
  Sparkles,
  Check,
  Clock3,
  Search,
  ChevronsUpDown,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { useAiStore } from "../../../stores/aiStore";
import { useAiStream } from "../hooks/useAiStream";
import type { ChatMessage } from "../hooks/useAiStream";
import { deleteConversation, getModels, listConversations } from "../api/aiApi";
import type { DocumentContextSnapshot, ModelInfo } from "../api/aiApi";

/** Offline / error fallback only — order is arbitrary; server `default_model_id` wins after fetch. */
const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: "google/gemma-4-31b-it:free",
    name: "Gemma 4 31B",
    provider: "Google",
    gateway: "openrouter",
    is_free: true,
    is_stealth: false,
    context_window: 262_144,
    description: "Instruction-tuned Gemma with native function calling and long context.",
  },
  {
    id: "z-ai/glm-4.5-air:free",
    name: "GLM-4.5 Air",
    provider: "Z.AI",
    gateway: "openrouter",
    is_free: true,
    is_stealth: false,
    context_window: 128_000,
    description: "Lightweight, fast general-purpose model from Z.AI.",
  },
  {
    id: "x-ai/grok-4.1-fast",
    name: "Grok 4.1 Fast",
    provider: "xAI",
    gateway: "openrouter",
    is_free: false,
    is_stealth: false,
    context_window: 2_000_000,
    description:
      "Agentic tool-calling model for support, research, and long context (via OpenRouter).",
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
  /** Whether the panel is currently in Agent mode. */
  is_agent_mode: boolean;
  /** Translated label for the thought block. */
  think_label: string;
}

/**
 * Props for a markdown-rendered message body.
 */
interface MarkdownContentProps {
  /** Markdown source to render. */
  content: string;
  /** Additional wrapper classes. */
  className?: string;
}

/**
 * Renders markdown with the panel's visual styling.
 */
function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-accent-main underline decoration-current underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="break-words">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border-subtle/80 pl-3 italic text-text-secondary">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const is_block_code = className?.includes("language-");

            if (is_block_code) {
              return <code className="font-mono text-ui-xs">{children}</code>;
            }

            return (
              <code className="rounded bg-ai-highlight px-1 py-0.5 font-mono text-[0.92em]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg border border-border-subtle bg-ai-highlight p-3 font-mono text-ui-xs leading-relaxed">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-3 border-border-subtle" />,
          h1: ({ children }) => <h1 className="mb-2 text-ui-base font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 text-ui-sm font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 text-ui-sm font-medium">{children}</h3>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Collapsible block that displays model reasoning / thought content.
 */
function ThinkBlock({
  content,
  label,
  default_open = false,
}: {
  content: string;
  label: string;
  default_open?: boolean;
}) {
  const [is_open, set_is_open] = useState(default_open);

  useEffect(() => {
    set_is_open(default_open);
  }, [default_open]);

  return (
    <details
      open={is_open}
      onToggle={(event) => set_is_open(event.currentTarget.open)}
      className="rounded-xl border border-border-subtle/80 bg-ai-highlight/60 px-3 py-2 text-text-secondary"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-ui-xs font-medium text-text-secondary transition-colors hover:text-text-primary [&::-webkit-details-marker]:hidden">
        <ChevronsUpDown className="h-3 w-3 shrink-0" aria-hidden="true" strokeWidth={2} />
        <span>{label}</span>
      </summary>
      <div className="mt-2 text-ui-xs leading-relaxed">
        <MarkdownContent
          content={content}
          className="break-words text-text-secondary [&_a]:text-text-secondary"
        />
      </div>
    </details>
  );
}

/**
 * Renders a single chat message bubble.
 * User messages are right-aligned; assistant messages are left-aligned.
 */
function MessageBubble({ message, is_agent_mode, think_label }: MessageBubbleProps) {
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
        {think_content && (
          <ThinkBlock
            content={think_content || "Pensando..."}
            label={think_label}
            default_open={is_agent_mode}
          />
        )}

        <div className={is_user ? "whitespace-pre-wrap break-words" : "break-words"}>
          {is_user ? (
            main_content
          ) : (
            <MarkdownContent
              content={main_content || ""}
              className="break-words text-text-primary"
            />
          )}
          {/* Animated typing cursor */}
          {is_animating && (
            <div className="mt-1">
              <span
                className="ml-1.5 inline-block h-2 w-2 rounded-full bg-current opacity-60 animate-[pulse_1s_cubic-bezier(0.4,0,0.6,1)_infinite] align-middle shadow-sm"
                aria-hidden="true"
              />
            </div>
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
  /** Workspace UUID for workspace-scoped retrieval. */
  workspace_id?: string;
  /** Folder UUID for folder-aware retrieval ranking. */
  folder_id?: string;
  /**
   * Callback that returns the current live editor snapshot on demand.
   * Called immediately before each message is sent so the AI always receives
   * an up-to-date document view, regardless of when the panel was opened or
   * how the document has changed since.
   */
  get_document_context?: () => DocumentContextSnapshot | string | undefined;
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
  workspace_id,
  folder_id,
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const modelPanelRef = useRef<HTMLDivElement>(null);

  // Fetch catalog; `default_model_id` comes from server OPENROUTER_MODEL (single backend source of truth).
  useEffect(() => {
    getModels()
      .then((res) => {
        setModels(res.models);
        const defaultId = res.default_model_id ?? res.models[0]?.id;

        if (!defaultId) {
          return;
        }

        const isCurrentSelectionValid =
          selectedModelId !== undefined && res.models.some((model) => model.id === selectedModelId);

        if (selectedModelId === undefined || !isCurrentSelectionValid) {
          setSelectedModelId(defaultId);
        }
      })
      .catch(() => {
        setModels(FALLBACK_MODELS);
        const fallbackId = FALLBACK_MODELS[0]?.id;
        if (
          fallbackId &&
          (selectedModelId === undefined || !FALLBACK_MODELS.some((m) => m.id === selectedModelId))
        ) {
          setSelectedModelId(fallbackId);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectableModels = models.length > 0 ? models : FALLBACK_MODELS;
  const selectedModel = selectableModels.find((model) => model.id === selectedModelId);

  const filteredRecentConversations = useMemo(() => {
    const needle = historyQuery.trim().toLowerCase();
    if (!needle) {
      return recentConversations;
    }

    return recentConversations.filter((conversation) => {
      const title = conversation.title ?? "";
      return title.toLowerCase().includes(needle) || conversation.id.toLowerCase().includes(needle);
    });
  }, [recentConversations, historyQuery]);

  const filteredModels = useMemo(() => {
    const needle = modelQuery.trim().toLowerCase();
    if (!needle) {
      return selectableModels;
    }

    return selectableModels.filter((model) => {
      return (
        model.name.toLowerCase().includes(needle) ||
        model.provider.toLowerCase().includes(needle) ||
        model.id.toLowerCase().includes(needle)
      );
    });
  }, [selectableModels, modelQuery]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (historyPanelRef.current && !historyPanelRef.current.contains(target)) {
        setIsHistoryOpen(false);
      }
      if (modelPanelRef.current && !modelPanelRef.current.contains(target)) {
        setIsModelOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

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
    await send_message(
      trimmed,
      document_id,
      workspace_id,
      folder_id,
      currentContext,
      selectedModelId,
      agentTypeToUse,
    );
  }, [
    inputValue,
    is_loading,
    send_message,
    document_id,
    workspace_id,
    folder_id,
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
      setIsHistoryOpen(false);
    },
    [activeConversationId, setConversation, clear, load_messages],
  );

  const handleSelectModel = useCallback(
    (modelId: string) => {
      setSelectedModelId(modelId || undefined);
      setIsModelOpen(false);
    },
    [setSelectedModelId],
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
  const is_agent_mode = aiMode === "agent";
  const think_label = t("thought_briefly");

  return (
    <aside
      className="flex w-[400px] shrink-0 flex-col border-l border-border-subtle bg-surface z-40 shadow-[-4px_0_24px_-8px_rgba(0,0,0,0.05)] transition-all duration-300 ease-in-out self-stretch"
      aria-label={t("panel_title")}
      role="complementary"
    >
      {/* Panel header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles
            className="h-4 w-4 shrink-0 text-accent-ai"
            aria-hidden="true"
            strokeWidth={2}
          />
          <span className="truncate text-ui-base font-semibold text-text-primary">
            {t("panel_title")}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div ref={historyPanelRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setIsHistoryOpen((value) => !value);
                setIsModelOpen(false);
                setHistoryQuery("");
              }}
              className="inline-flex items-center gap-2 rounded-md border border-border-subtle px-3 py-1.5 text-ui-xs text-text-secondary transition-colors hover:border-accent-ai hover:text-text-primary"
              aria-expanded={isHistoryOpen}
              aria-label={t("history_selector")}
            >
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {t("history_selector")}
            </button>

            {isHistoryOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsHistoryOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-2 w-[320px] rounded-xl border border-border-subtle bg-surface p-3 shadow-elevated">
                  <label className="flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-ui-xs text-text-secondary">
                    <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <input
                      value={historyQuery}
                      onChange={(e) => setHistoryQuery(e.target.value)}
                      placeholder={t("history_search_placeholder")}
                      className="w-full bg-transparent outline-none placeholder:text-text-secondary/60"
                    />
                  </label>

                  <div className="mt-3 max-h-[240px] overflow-y-auto pr-1">
                    <p className="px-1 pb-2 text-[10px] uppercase tracking-[0.12em] text-text-secondary">
                      {t("recent_conversations_title")}
                    </p>
                    {filteredRecentConversations.length > 0 ? (
                      <div className="space-y-1">
                        {filteredRecentConversations.map((conversation, index) => (
                          <button
                            key={conversation.id}
                            type="button"
                            onClick={() => handleSelectConversation(conversation.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-ui-sm text-text-primary transition-colors hover:bg-app"
                            title={
                              conversation.title?.trim().length
                                ? conversation.title
                                : `Conversation ${index + 1}`
                            }
                          >
                            <span className="truncate">
                              {conversation.title?.trim().length
                                ? conversation.title
                                : `Conversation ${index + 1}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="px-1 py-2 text-ui-sm text-text-secondary">
                        {t("recent_conversations_empty")}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

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
          <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
            <p className="text-ui-sm text-text-secondary">{t("empty_state")}</p>
          </div>
        )}

        {has_messages && (
          <div className="flex flex-col">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                is_agent_mode={is_agent_mode}
                think_label={think_label}
              />
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

      {/* Bottom controls and message bar */}
      <div className="shrink-0 border-t border-border-subtle bg-surface px-3 pb-3 pt-2">
        <div className="mb-2 flex items-center gap-2">
          <div className="relative" ref={modelPanelRef}>
            <button
              type="button"
              onClick={() => {
                setIsModelOpen((value) => !value);
                setIsHistoryOpen(false);
                setModelQuery("");
              }}
              className="inline-flex min-w-[190px] items-center justify-between gap-2 rounded-md border border-border-subtle bg-app px-3 py-2 text-ui-xs text-text-primary transition-colors hover:border-accent-ai"
              aria-expanded={isModelOpen}
              aria-label={t("model_selector")}
            >
              <span className="truncate">{selectedModel?.name ?? t("model_selector")}</span>
              <ChevronsUpDown
                className="h-3.5 w-3.5 shrink-0 text-text-secondary"
                aria-hidden="true"
              />
            </button>

            {isModelOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsModelOpen(false)} />
                <div className="absolute left-0 bottom-full z-40 mb-2 w-[320px] rounded-xl border border-border-subtle bg-surface p-3 shadow-elevated">
                  <label className="flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-ui-xs text-text-secondary">
                    <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <input
                      value={modelQuery}
                      onChange={(e) => setModelQuery(e.target.value)}
                      placeholder={t("model_search_placeholder")}
                      className="w-full bg-transparent outline-none placeholder:text-text-secondary/60"
                    />
                  </label>

                  <div className="mt-3 max-h-[260px] overflow-y-auto pr-1">
                    {filteredModels.length > 0 ? (
                      <div className="space-y-1">
                        {filteredModels.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => handleSelectModel(model.id)}
                            className={[
                              "flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-app",
                              model.id === selectedModelId ? "bg-app" : "",
                            ].join(" ")}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-ui-sm text-text-primary">
                                {model.name}
                              </span>
                              <span className="block truncate text-[11px] text-text-secondary">
                                {model.provider}
                              </span>
                            </span>
                            {model.id === selectedModelId && (
                              <Check
                                className="h-3.5 w-3.5 shrink-0 text-accent-ai"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="px-1 py-2 text-ui-sm text-text-secondary">
                        {t("models_empty")}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="inline-flex rounded-md border border-border-subtle bg-app p-0.5">
            <button
              onClick={() => setAiMode("ask")}
              className={[
                "rounded-[4px] px-3 py-1.5 text-ui-xs font-medium transition-colors",
                aiMode === "ask"
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              ].join(" ")}
            >
              {t("mode_ask")}
            </button>
            <button
              onClick={() => setAiMode("agent")}
              className={[
                "rounded-[4px] px-3 py-1.5 text-ui-xs font-medium transition-colors",
                aiMode === "agent"
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary",
              ].join(" ")}
            >
              {t("mode_agent")}
            </button>
          </div>
        </div>

        <div className="flex items-end gap-2 rounded-xl border border-border-subtle bg-app px-3 py-2.5 transition-all duration-200 focus-within:border-accent-ai focus-within:ring-1 focus-within:ring-accent-ai/20 shadow-sm">
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

        <p className="mt-1.5 text-center text-ui-xs text-text-secondary/50">{t("keyboard_hint")}</p>
      </div>
    </aside>
  );
}
