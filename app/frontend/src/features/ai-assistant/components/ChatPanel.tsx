import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
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
  FileText,
  LoaderCircle,
  PencilLine,
  Pilcrow,
  Sigma,
  Type,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { useAiStore } from "../../../stores/aiStore";
import { useAiStream } from "../hooks/useAiStream";
import type { ChatMessage } from "../hooks/useAiStream";
import { deleteConversation, getModels, listConversations } from "../api/aiApi";
import type { DocumentContextSnapshot, ModelInfo } from "../api/aiApi";

/** Offline / error fallback only — order is arbitrary; server `default_model_id` wins after fetch. */
const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    gateway: "openrouter",
    is_free: false,
    is_stealth: false,
    context_window: 1_048_576,
    description: "Primary model for fast, high-throughput general and coding workloads.",
  },
  {
    id: "minimax/minimax-m2.7",
    name: "MiniMax M2.7",
    provider: "MiniMax",
    gateway: "openrouter",
    is_free: false,
    is_stealth: false,
    context_window: 196_608,
    description: "First fallback model with strong agentic and planning capabilities.",
  },
  {
    id: "xiaomi/mimo-v2.5",
    name: "MiMo-V2.5",
    provider: "Xiaomi",
    gateway: "openrouter",
    is_free: false,
    is_stealth: false,
    context_window: 1_048_576,
    description: "Second fallback model optimized for multimodal and long-context tasks.",
  },
  {
    id: "xiaomi/mimo-v2.5-pro",
    name: "MiMo-V2.5-Pro",
    provider: "Xiaomi",
    gateway: "openrouter",
    is_free: false,
    is_stealth: false,
    context_window: 1_048_576,
    description: "Third fallback model focused on stronger complex reasoning performance.",
  },
  {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    provider: "Moonshot AI",
    gateway: "openrouter",
    is_free: false,
    is_stealth: false,
    context_window: 256_000,
    description: "Final fallback model for long-horizon coding and orchestration tasks.",
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
  /** Active locale code used for inline assistant UI copy. */
  language: string;
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
function MessageBubble({ message, is_agent_mode, think_label, language }: MessageBubbleProps) {
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
  const has_tool_trace = message.tool_calls.length > 0;

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
          {is_user
            ? main_content
            : renderAssistantContentWithToolCalls(
                main_content || "",
                message.tool_calls,
                !message.is_streaming,
                language,
              )}
          {/* Animated typing cursor */}
          {is_animating && (main_content || !has_tool_trace) && (
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

function groupToolCallsByOffset(toolCalls: ChatMessage["tool_calls"]) {
  const sortedToolCalls = [...toolCalls].sort((a, b) => a.text_offset - b.text_offset);
  const groups: Array<{ text_offset: number; tool_calls: ChatMessage["tool_calls"] }> = [];

  for (const toolCall of sortedToolCalls) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.text_offset === toolCall.text_offset) {
      lastGroup.tool_calls.push(toolCall);
      continue;
    }

    groups.push({ text_offset: toolCall.text_offset, tool_calls: [toolCall] });
  }

  return groups;
}

function renderAssistantContentWithToolCalls(
  content: string,
  toolCalls: ChatMessage["tool_calls"],
  isCompleted: boolean,
  language: string,
) {
  if (toolCalls.length === 0) {
    return content ? (
      <MarkdownContent content={content} className="break-words text-text-primary" />
    ) : null;
  }

  const groups = groupToolCallsByOffset(toolCalls);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  groups.forEach((group, index) => {
    const clampedOffset = Math.max(0, Math.min(group.text_offset, content.length));
    const chunk = content.slice(cursor, clampedOffset);

    if (chunk) {
      nodes.push(
        <MarkdownContent
          key={`content-${index}-${cursor}`}
          content={chunk}
          className="break-words text-text-primary"
        />,
      );
    }

    nodes.push(
      <ToolCallInlineTrace
        key={`tool-${index}-${clampedOffset}`}
        toolCalls={group.tool_calls}
        isCompleted={isCompleted}
        language={language}
      />,
    );

    cursor = clampedOffset;
  });

  const tail = content.slice(cursor);
  if (tail) {
    nodes.push(
      <MarkdownContent
        key={`content-tail-${cursor}`}
        content={tail}
        className="break-words text-text-primary"
      />,
    );
  }

  return <>{nodes}</>;
}

// ---------------------------------------------------------------------------
// Tool call trace
// ---------------------------------------------------------------------------

/**
 * Props for a single tool call item shown during/after an agent run.
 */
interface ToolCallTraceItemProps {
  /** Structured trace entry for the tool call. */
  toolCall: ChatMessage["tool_calls"][number];
  /** Whether the agent run has finished and this tool call is resolved. */
  isCompleted?: boolean;
}

interface ToolCallPresentation {
  pendingLabel: string;
  completedLabel: string;
  categoryLabel: string;
  description: string;
  icon: LucideIcon;
}

const TOOL_CALL_ICONS: Record<string, LucideIcon> = {
  get_document_content: FileText,
  get_selection_content: FileText,
  count_words: Sigma,
  count_characters: Type,
  count_paragraphs: Pilcrow,
  count_sentences: Sigma,
  estimate_reading_time: Clock3,
  propose_document_replacement: PencilLine,
};

const TOOL_CALL_COPY = {
  en: {
    get_document_content: {
      pendingLabel: "Reading document...",
      completedLabel: "Read document",
      categoryLabel: "Document context",
      description: "Reads the current document content before responding.",
    },
    get_selection_content: {
      pendingLabel: "Reading selection...",
      completedLabel: "Read selection",
      categoryLabel: "Selected text",
      description: "Reads the current text selection to focus the answer.",
    },
    count_words: {
      pendingLabel: "Counting words...",
      completedLabel: "Counted words",
      categoryLabel: "Document metric",
      description: "Counts words deterministically from the document snapshot.",
    },
    count_characters: {
      pendingLabel: "Counting characters...",
      completedLabel: "Counted characters",
      categoryLabel: "Document metric",
      description: "Counts characters with and without spaces.",
    },
    count_paragraphs: {
      pendingLabel: "Counting paragraphs...",
      completedLabel: "Counted paragraphs",
      categoryLabel: "Document metric",
      description: "Counts non-empty paragraph blocks in the document.",
    },
    count_sentences: {
      pendingLabel: "Counting sentences...",
      completedLabel: "Counted sentences",
      categoryLabel: "Document metric",
      description: "Counts sentence-like spans using punctuation boundaries.",
    },
    estimate_reading_time: {
      pendingLabel: "Estimating reading time...",
      completedLabel: "Estimated reading time",
      categoryLabel: "Document metric",
      description: "Estimates reading time from the current word count.",
    },
    propose_document_replacement: {
      pendingLabel: "Preparing edit...",
      completedLabel: "Prepared edit",
      categoryLabel: "Document update",
      description: "Builds a proposed replacement for review in the editor.",
    },
  },
  es: {
    get_document_content: {
      pendingLabel: "Leyendo documento...",
      completedLabel: "Documento leído",
      categoryLabel: "Contexto del documento",
      description: "Lee el contenido actual del documento antes de responder.",
    },
    get_selection_content: {
      pendingLabel: "Leyendo selección...",
      completedLabel: "Selección leída",
      categoryLabel: "Texto seleccionado",
      description: "Lee la selección actual para centrar mejor la respuesta.",
    },
    count_words: {
      pendingLabel: "Contando palabras...",
      completedLabel: "Palabras contadas",
      categoryLabel: "Métrica del documento",
      description: "Cuenta las palabras de forma determinista sobre el documento.",
    },
    count_characters: {
      pendingLabel: "Contando caracteres...",
      completedLabel: "Caracteres contados",
      categoryLabel: "Métrica del documento",
      description: "Cuenta caracteres con y sin espacios.",
    },
    count_paragraphs: {
      pendingLabel: "Contando párrafos...",
      completedLabel: "Párrafos contados",
      categoryLabel: "Métrica del documento",
      description: "Cuenta los bloques de párrafo no vacíos del documento.",
    },
    count_sentences: {
      pendingLabel: "Contando frases...",
      completedLabel: "Frases contadas",
      categoryLabel: "Métrica del documento",
      description: "Cuenta frases usando límites de puntuación.",
    },
    estimate_reading_time: {
      pendingLabel: "Estimando tiempo de lectura...",
      completedLabel: "Tiempo de lectura estimado",
      categoryLabel: "Métrica del documento",
      description: "Estima el tiempo de lectura a partir del conteo de palabras.",
    },
    propose_document_replacement: {
      pendingLabel: "Preparando edición...",
      completedLabel: "Edición preparada",
      categoryLabel: "Actualización del documento",
      description: "Prepara una propuesta de reemplazo para revisarla en el editor.",
    },
  },
} satisfies Record<"en" | "es", Record<string, Omit<ToolCallPresentation, "icon">>>;

const INLINE_ONLY_TOOLS = new Set(["get_document_content", "get_selection_content"]);

function getLanguageBucket(language: string): "en" | "es" {
  return language.toLowerCase().startsWith("es") ? "es" : "en";
}

function getToolPresentation(toolName: string, language: string): ToolCallPresentation {
  const languageBucket = getLanguageBucket(language);
  const localizedCopy = TOOL_CALL_COPY[languageBucket] as Record<
    string,
    Omit<ToolCallPresentation, "icon">
  >;
  const copy = localizedCopy[toolName];

  return {
    pendingLabel: copy?.pendingLabel ?? `${humanizeToolName(toolName)}...`,
    completedLabel: copy?.completedLabel ?? humanizeToolName(toolName),
    categoryLabel: copy?.categoryLabel ?? (languageBucket === "es" ? "Herramienta" : "Tool call"),
    description:
      copy?.description ??
      (languageBucket === "es"
        ? "La IA ha usado esta herramienta como parte de la respuesta."
        : "The assistant used this tool while producing the answer."),
    icon: TOOL_CALL_ICONS[toolName] ?? Wrench,
  };
}

function getToolResultSummary(toolCall: ChatMessage["tool_calls"][number], language: string) {
  const languageBucket = getLanguageBucket(language);
  const result = toolCall.result;

  if (toolCall.tool_name === "count_words" && typeof result === "object" && result !== null) {
    const value = (result as { value?: unknown }).value;
    if (typeof value === "number") {
      return languageBucket === "es" ? `${value} palabras` : `${value} words`;
    }
  }

  if (toolCall.tool_name === "count_sentences" && typeof result === "object" && result !== null) {
    const value = (result as { value?: unknown }).value;
    if (typeof value === "number") {
      return languageBucket === "es" ? `${value} frases` : `${value} sentences`;
    }
  }

  if (toolCall.tool_name === "count_paragraphs" && typeof result === "object" && result !== null) {
    const value = (result as { value?: unknown }).value;
    if (typeof value === "number") {
      return languageBucket === "es" ? `${value} párrafos` : `${value} paragraphs`;
    }
  }

  if (toolCall.tool_name === "count_characters" && typeof result === "object" && result !== null) {
    const value = (result as { value?: { with_spaces?: unknown; without_spaces?: unknown } }).value;
    if (typeof value?.with_spaces === "number" && typeof value?.without_spaces === "number") {
      return languageBucket === "es"
        ? `${value.with_spaces} caracteres (${value.without_spaces} sin espacios)`
        : `${value.with_spaces} chars (${value.without_spaces} without spaces)`;
    }
  }

  if (
    toolCall.tool_name === "estimate_reading_time" &&
    typeof result === "object" &&
    result !== null
  ) {
    const value = (result as { value?: { minutes?: unknown; seconds?: unknown } }).value;
    if (typeof value?.minutes === "number" && typeof value?.seconds === "number") {
      return languageBucket === "es"
        ? `${value.minutes} min ${value.seconds} s`
        : `${value.minutes}m ${value.seconds}s`;
    }
  }

  if (typeof toolCall.result_summary === "string" && toolCall.result_summary.trim()) {
    return toolCall.result_summary;
  }

  return null;
}

function humanizeToolName(toolName: string) {
  return toolName
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

/**
 * Displays a visible trace row for a tool used by the agent.
 * Shows a spinner while the run is active and a checkmark once completed.
 */
function ToolCallTraceItem({
  toolCall,
  isCompleted = false,
  language,
}: ToolCallTraceItemProps & { language: string }) {
  const toolName = toolCall.tool_name;
  const presentation = getToolPresentation(toolName, language);
  const Icon = presentation.icon;
  const label = isCompleted ? presentation.completedLabel : presentation.pendingLabel;
  const categoryLabel = presentation.categoryLabel;
  const resultSummary = getToolResultSummary(toolCall, language);
  const stateLabel =
    getLanguageBucket(language) === "es"
      ? isCompleted
        ? "Completada"
        : "En curso"
      : isCompleted
        ? "Completed"
        : "Running";

  return (
    <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-text-secondary">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-ai/8 text-accent-ai">
        {isCompleted ? (
          <Check className="h-3 w-3" aria-hidden="true" strokeWidth={2.5} />
        ) : (
          <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" strokeWidth={2.25} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 shrink-0 text-accent-ai" aria-hidden="true" strokeWidth={2} />
          <p className="truncate text-ui-xs font-medium text-text-primary">{label}</p>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-text-secondary/90">
          <span>{categoryLabel}</span>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-accent-ai/45" />
          <span>{stateLabel}</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-text-secondary/80">
          {presentation.description}
        </p>
        {resultSummary && (
          <p className="mt-1 text-[11px] leading-relaxed text-accent-ai">{resultSummary}</p>
        )}
      </div>
    </div>
  );
}

function getToolTraceSummary(
  toolCalls: ChatMessage["tool_calls"],
  isCompleted: boolean,
  language: string,
) {
  const languageBucket = getLanguageBucket(language);
  const primaryTool =
    [...toolCalls]
      .reverse()
      .find(
        (toolCall) =>
          toolCall.tool_name !== "get_document_content" &&
          toolCall.tool_name !== "get_selection_content",
      ) ?? toolCalls[toolCalls.length - 1];
  const primaryToolName = primaryTool?.tool_name;
  const hasDocumentRead = toolCalls.some(
    (toolCall) => toolCall.tool_name === "get_document_content",
  );
  const hasSelectionRead = toolCalls.some(
    (toolCall) => toolCall.tool_name === "get_selection_content",
  );

  if (toolCalls.length > 2) {
    if (languageBucket === "es") {
      return isCompleted
        ? `He usado ${toolCalls.length} herramientas antes de responder.`
        : `Déjame ejecutar ${toolCalls.length} herramientas antes de responder...`;
    }

    return isCompleted
      ? `I used ${toolCalls.length} tools before answering.`
      : `Let me run ${toolCalls.length} tools before answering...`;
  }

  switch (primaryToolName) {
    case "count_words":
      if (languageBucket === "es") {
        return isCompleted
          ? hasDocumentRead
            ? "He leído el documento y he contado las palabras antes de responder."
            : "He contado las palabras antes de responder."
          : hasDocumentRead
            ? "Déjame leer primero el documento y contar las palabras..."
            : "Déjame contar primero las palabras...";
      }
      return isCompleted
        ? hasDocumentRead
          ? "I read the document and counted the words before answering."
          : "I counted the words before answering."
        : hasDocumentRead
          ? "Let me read the document and count the words first..."
          : "Let me count the words first...";
    case "count_sentences":
      if (languageBucket === "es") {
        return isCompleted
          ? hasDocumentRead
            ? "He leído el documento y he contado las frases antes de responder."
            : "He contado las frases antes de responder."
          : hasDocumentRead
            ? "Déjame leer primero el documento y contar las frases..."
            : "Déjame contar primero las frases...";
      }
      return isCompleted
        ? hasDocumentRead
          ? "I read the document and counted the sentences before answering."
          : "I counted the sentences before answering."
        : hasDocumentRead
          ? "Let me read the document and count the sentences first..."
          : "Let me count the sentences first...";
    case "count_characters":
      if (languageBucket === "es") {
        return isCompleted
          ? hasDocumentRead
            ? "He leído el documento y he contado los caracteres antes de responder."
            : "He contado los caracteres antes de responder."
          : hasDocumentRead
            ? "Déjame leer primero el documento y contar los caracteres..."
            : "Déjame contar primero los caracteres...";
      }
      return isCompleted
        ? hasDocumentRead
          ? "I read the document and counted the characters before answering."
          : "I counted the characters before answering."
        : hasDocumentRead
          ? "Let me read the document and count the characters first..."
          : "Let me count the characters first...";
    case "count_paragraphs":
      if (languageBucket === "es") {
        return isCompleted
          ? hasDocumentRead
            ? "He leído el documento y he contado los párrafos antes de responder."
            : "He contado los párrafos antes de responder."
          : hasDocumentRead
            ? "Déjame leer primero el documento y contar los párrafos..."
            : "Déjame contar primero los párrafos...";
      }
      return isCompleted
        ? hasDocumentRead
          ? "I read the document and counted the paragraphs before answering."
          : "I counted the paragraphs before answering."
        : hasDocumentRead
          ? "Let me read the document and count the paragraphs first..."
          : "Let me count the paragraphs first...";
    case "estimate_reading_time":
      return languageBucket === "es"
        ? isCompleted
          ? "He estimado el tiempo de lectura antes de responder."
          : "Déjame estimar primero el tiempo de lectura..."
        : isCompleted
          ? "I estimated the reading time before answering."
          : "Let me estimate the reading time first...";
    case "propose_document_replacement":
      if (languageBucket === "es") {
        return isCompleted
          ? hasSelectionRead
            ? "He revisado la selección y he preparado la edición para tu petición."
            : hasDocumentRead
              ? "He revisado el documento y he preparado la edición para tu petición."
              : "He preparado la edición para tu petición."
          : hasSelectionRead
            ? "Voy a revisar la selección y preparar la edición..."
            : hasDocumentRead
              ? "Voy a revisar el documento y preparar la edición..."
              : "Voy a preparar la edición para tu petición...";
      }
      return isCompleted
        ? hasSelectionRead
          ? "I reviewed the selection and prepared the edit for your request."
          : hasDocumentRead
            ? "I reviewed the document and prepared the edit for your request."
            : "I prepared the edit for your request."
        : hasSelectionRead
          ? "Let me review the selection and prepare the edit..."
          : hasDocumentRead
            ? "Let me review the document and prepare the edit..."
            : "Let me prepare the edit for your request...";
    case "get_selection_content":
      return languageBucket === "es"
        ? isCompleted
          ? "He revisado la selección antes de responder."
          : "Déjame revisar primero la selección..."
        : isCompleted
          ? "I reviewed the selection before answering."
          : "Let me review the selection first...";
    case "get_document_content":
      return languageBucket === "es"
        ? isCompleted
          ? "He revisado el documento antes de responder."
          : "Déjame leer primero el documento..."
        : isCompleted
          ? "I reviewed the document before answering."
          : "Let me read the document first...";
    default:
      return languageBucket === "es"
        ? isCompleted
          ? `He usado ${toolCalls.length} herramienta${toolCalls.length === 1 ? "" : "s"} antes de responder.`
          : "Déjame usar una herramienta antes de responder..."
        : isCompleted
          ? `I used ${toolCalls.length} tool${toolCalls.length === 1 ? "" : "s"} before answering.`
          : "Let me use a tool before answering...";
  }
}

function ToolCallInlineTrace({
  toolCalls,
  isCompleted,
  language,
}: {
  toolCalls: ChatMessage["tool_calls"];
  isCompleted: boolean;
  language: string;
}) {
  const languageBucket = getLanguageBucket(language);
  const [isExpanded, setIsExpanded] = useState(!isCompleted);
  const isOpen = !isCompleted || isExpanded;

  const summaryText = getToolTraceSummary(toolCalls, isCompleted, language);
  const countLabel =
    languageBucket === "es"
      ? `${toolCalls.length} herramienta${toolCalls.length === 1 ? "" : "s"}`
      : `${toolCalls.length} tool${toolCalls.length === 1 ? "" : "s"}`;
  const isExpandable =
    toolCalls.length > 1 ||
    !toolCalls.every((toolCall) => INLINE_ONLY_TOOLS.has(toolCall.tool_name));

  const summaryContent = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {isCompleted ? (
          <Check
            className="h-3.5 w-3.5 shrink-0 text-accent-ai"
            aria-hidden="true"
            strokeWidth={2.5}
          />
        ) : (
          <LoaderCircle
            className="h-3.5 w-3.5 shrink-0 animate-spin text-accent-ai"
            aria-hidden="true"
            strokeWidth={2.25}
          />
        )}
        <span className="truncate text-ui-xs font-medium text-text-secondary">{summaryText}</span>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-1.5 text-[10px] text-text-secondary/80">
        <span>{countLabel}</span>
        {isExpandable && <ChevronsUpDown className="h-3 w-3" aria-hidden="true" strokeWidth={2} />}
      </div>
    </>
  );

  if (!isExpandable) {
    return (
      <div className="mt-2 rounded-xl border border-border-subtle/70 bg-ai-highlight/35 px-3 py-2">
        <div className="flex items-center justify-between gap-2">{summaryContent}</div>
      </div>
    );
  }

  return (
    <details
      open={isOpen}
      onToggle={(event) => setIsExpanded(event.currentTarget.open)}
      className="mt-2 rounded-xl border border-border-subtle/70 bg-ai-highlight/35 px-3 py-2"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        {summaryContent}
      </summary>
      <div className="mt-2 border-t border-border-subtle/70 pt-2">
        <div className="space-y-1">
          {toolCalls.map((toolCall, idx: number) => (
            <ToolCallTraceItem
              key={`${toolCall.tool_name}-${toolCall.text_offset}-${idx}`}
              toolCall={toolCall}
              isCompleted={isCompleted}
              language={language}
            />
          ))}
        </div>
      </div>
    </details>
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
  get_document_context,
  resolve_pending_change_token,
}: ChatPanelProps) {
  const { t, i18n } = useTranslation("ai");

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
                language={i18n.language}
              />
            ))}
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
