import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Check, AlertCircle, Sparkles } from "lucide-react";
import type { JSONContent, Editor } from "@tiptap/react";
import { CaretEditor } from "./CaretEditor";
import { Button } from "../../../components/ui/Button";
import { use_document } from "../hooks/use_document";
import { use_save_document } from "../hooks/use_save_document";
import { use_focus_mode } from "../../../hooks/use_focus_mode";
import { use_tabs_store } from "../../../stores/tabs_store";
import { use_ai_store } from "../../../stores";
import { useGhostText } from "../hooks/use_ghost_text";
import { index_document_embeddings } from "../../ai-assistant/api/ai_api";
import type { DocumentChangePayload } from "../../ai-assistant/api/ai_api";

/**
 * Lazy-load the AI Chat Panel to keep the initial bundle lean.
 * The panel is only rendered when the user opens it via Ctrl/Cmd+K.
 */
const ChatPanel = lazy(() => import("../../ai-assistant").then((m) => ({ default: m.ChatPanel })));

/** Debounce delay in milliseconds before autosaving after the last keystroke. */
const AUTOSAVE_DELAY_MS = 1_000;

/** Debounce delay for title saves (shorter since it's a single field). */
const TITLE_SAVE_DELAY_MS = 500;

/** Possible states for the save status indicator. */
type SaveStatus = "idle" | "saving" | "saved" | "error";

/** A single line entry in the review diff. */
interface DiffLine {
  type: "equal" | "removed" | "added" | "context_break";
  text: string;
}

/**
 * Compute a line-level diff between two plain-text strings using LCS.
 */
function compute_line_diff(original: string, proposed: string): DiffLine[] {
  const a = original.split("\n");
  const b = proposed.split("\n");
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: "equal", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", text: b[j - 1] });
      j--;
    } else {
      result.unshift({ type: "removed", text: a[i - 1] });
      i--;
    }
  }

  return result;
}

/**
 * Compact a full diff by collapsing unchanged runs, while keeping two context
 * lines around each change block.
 */
function compact_line_diff(lines: DiffLine[]): DiffLine[] {
  const changed_indexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.type !== "equal")
    .map(({ index }) => index);

  if (changed_indexes.length === 0) {
    return [];
  }

  const keep_indexes = new Set<number>();
  for (const index of changed_indexes) {
    for (let i = Math.max(0, index - 2); i <= Math.min(lines.length - 1, index + 2); i++) {
      keep_indexes.add(i);
    }
  }

  const compacted: DiffLine[] = [];
  let index = 0;
  while (index < lines.length) {
    if (keep_indexes.has(index)) {
      compacted.push(lines[index]);
      index++;
      continue;
    }

    let hidden_count = 0;
    while (index < lines.length && !keep_indexes.has(index)) {
      hidden_count++;
      index++;
    }
    if (hidden_count > 0) {
      compacted.push({ type: "context_break", text: `${hidden_count} unchanged lines` });
    }
  }

  return compacted;
}

interface DocumentChangeReviewOverlayProps {
  pending_change: DocumentChangePayload;
  on_accept: () => void;
  on_reject: () => void;
}

/**
 * Floating review card rendered directly over the editor canvas.
 * Mirrors a git-style diff with explicit Accept/Reject actions.
 */
function DocumentChangeReviewOverlay({
  pending_change,
  on_accept,
  on_reject,
}: DocumentChangeReviewOverlayProps) {
  const full_diff = compute_line_diff(
    pending_change.original_text ?? "",
    pending_change.proposed_text,
  );
  const diff = compact_line_diff(full_diff);

  const added_count = full_diff.filter((line) => line.type === "added").length;
  const removed_count = full_diff.filter((line) => line.type === "removed").length;
  const has_changes = added_count > 0 || removed_count > 0;

  return (
    <div className="absolute inset-x-3 top-3 z-40 pointer-events-none">
      <div className="mx-auto w-full max-w-[var(--max-width-document-wide)] pointer-events-auto rounded-lg border border-accent-ai/30 bg-surface/95 shadow-elevated backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border-subtle">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent-ai" />
            <span className="text-ui-sm font-medium text-accent-ai">AI proposed changes</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="rounded-full bg-diff-add-bg px-2 py-0.5 text-[10px] font-mono text-text-primary">
              +{added_count}
            </span>
            <span className="rounded-full bg-diff-del-bg px-2 py-0.5 text-[10px] font-mono text-diff-del-text">
              -{removed_count}
            </span>
          </div>
        </div>

        {has_changes ? (
          <div className="max-h-[300px] overflow-y-auto border-b border-border-subtle bg-app/80 font-mono text-[11px] leading-relaxed">
            {diff.map((line, idx) => {
              if (line.type === "context_break") {
                return (
                  <div key={`gap-${idx}`} className="px-3 py-1 text-center text-text-secondary/65">
                    ... {line.text} ...
                  </div>
                );
              }

              return (
                <div
                  key={`${line.type}-${idx}-${line.text}`}
                  className={[
                    "flex items-start gap-2 px-3 py-px whitespace-pre-wrap break-all",
                    line.type === "removed"
                      ? "bg-diff-del-bg/70 text-diff-del-text"
                      : line.type === "added"
                        ? "bg-diff-add-bg/70 text-text-primary"
                        : "text-text-secondary/60",
                  ].join(" ")}
                >
                  <span className="select-none w-3 shrink-0 text-center">
                    {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
                  </span>
                  <span>{line.text || "\u00a0"}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-3 py-2 text-ui-xs text-text-secondary">No textual changes detected.</p>
        )}

        <div className="flex items-center justify-end gap-2 px-3 py-2">
          <button
            onClick={on_reject}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-ui-xs font-medium text-text-secondary hover:bg-app transition-colors"
          >
            Reject
          </button>
          <button
            onClick={on_accept}
            className="flex items-center gap-1.5 rounded-md bg-accent-ai px-3 py-1.5 text-ui-xs font-medium text-white hover:bg-accent-ai/90 transition-colors"
          >
            <Check className="h-3 w-3" />
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Editor page component.
 *
 * Loads a document by ID from the URL, renders the CaretEditor with
 * its content, and autosaves changes after a debounce period. Displays
 * a status indicator showing "Saving...", "Saved", or "Error".
 * The document title is editable inline above the editor.
 */
export function EditorPage() {
  const { id: document_id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: document, isLoading, error } = use_document(document_id);
  const save_mutation = use_save_document(document_id ?? "");

  const [save_status, set_save_status] = useState<SaveStatus>("idle");
  const [title, set_title] = useState("");
  const [is_title_focused, set_is_title_focused] = useState(false);
  const debounce_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const title_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved_indicator_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Ref to the Tiptap Editor instance, used to extract document context for AI. */
  const editor_ref = useRef<Editor | null>(null);

  /**
   * Stores the editor's original HTML before an AI preview is applied so the
   * user can reject and revert the change.
   */
  const original_content_ref = useRef<string | null>(null);

  /**
   * Monotonic token used to tell ChatPanel when an external accept/reject
   * action has resolved the current pending change.
   */
  const [resolve_pending_change_token, set_resolve_pending_change_token] = useState(0);

  /**
   * Tracks which pending-change payload has already been preview-applied.
   */
  const applied_preview_key_ref = useRef<string | null>(null);

  /**
   * State-tracked Tiptap editor instance, needed for the useGhostText hook
   * which must re-register keyboard listeners whenever the editor changes.
   */
  const [editor_instance, set_editor_instance] = useState<Editor | null>(null);

  const { add_tab, update_tab_title } = use_tabs_store();

  /** AI panel state and active conversation from the global store. */
  const {
    is_panel_open,
    toggle_panel,
    active_conversation_id,
    pending_document_change,
    set_pending_document_change,
  } = use_ai_store();
  const pending_change = pending_document_change;

  /** Wire up the ghost text (inline AI completion) feature for the editor. */
  useGhostText({ editor: editor_instance, conversation_id: active_conversation_id });

  /** Activate focus mode: fade peripheral UI after 2s idle (FRONTEND.md §9). */
  use_focus_mode(true);

  /**
   * Global Ctrl/Cmd+K keyboard shortcut to toggle the AI chat panel.
   * Registered at the EditorPage level so it works regardless of focus.
   */
  useEffect(() => {
    function handle_keydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        toggle_panel();
      }
    }
    window.addEventListener("keydown", handle_keydown);
    return () => window.removeEventListener("keydown", handle_keydown);
  }, [toggle_panel]);

  /** Sync title from server data when document loads. */
  useEffect(() => {
    if (document?.title && !is_title_focused) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      set_title(document.title);
    }
  }, [document?.title, is_title_focused]);

  /**
   * Register (or focus) this document as an open tab when it loads.
   * Keeps the tab title in sync whenever the server-fetched title changes.
   */
  useEffect(() => {
    if (document_id && document?.title) {
      add_tab({ id: document_id, title: document.title });
      update_tab_title(document_id, document.title);
    }
  }, [document_id, document?.title, add_tab, update_tab_title]);

  /** Clean up timers on unmount. */
  useEffect(() => {
    return () => {
      if (debounce_timer_ref.current) {
        clearTimeout(debounce_timer_ref.current);
      }
      if (title_timer_ref.current) {
        clearTimeout(title_timer_ref.current);
      }
      if (saved_indicator_timer_ref.current) {
        clearTimeout(saved_indicator_timer_ref.current);
      }
    };
  }, []);

  /**
   * Show the "Saved" indicator, then clear it after 2 seconds.
   */
  const show_saved = useCallback(() => {
    set_save_status("saved");
    if (saved_indicator_timer_ref.current) {
      clearTimeout(saved_indicator_timer_ref.current);
    }
    saved_indicator_timer_ref.current = setTimeout(() => {
      set_save_status("idle");
    }, 2_000);
  }, []);

  /**
   * Handle editor content changes with debounced autosave.
   * Resets the debounce timer on every keystroke, then saves
   * after AUTOSAVE_DELAY_MS of inactivity.
   * After a successful save, re-indexes the document in the vector store
   * so RAG context stays up-to-date (fire-and-forget; errors are silenced
   * to avoid disrupting the editing experience).
   */
  const handle_update = useCallback(
    (json: JSONContent, text: string) => {
      // Don't autosave while previewing an AI change, to avoid saving unaccepted changes.
      if (use_ai_store.getState().pending_document_change !== null) {
        return;
      }

      if (debounce_timer_ref.current) {
        clearTimeout(debounce_timer_ref.current);
      }

      debounce_timer_ref.current = setTimeout(async () => {
        set_save_status("saving");

        try {
          await save_mutation.mutateAsync({
            content_json: json as Record<string, unknown>,
            content_text: text,
          });
          show_saved();

          // Re-index embeddings in the background; never block the UI on this.
          if (document_id && text.trim()) {
            index_document_embeddings(document_id, text).catch(() => {
              // Silently ignore embedding errors — RAG is best-effort.
            });
          }
        } catch {
          set_save_status("error");
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [save_mutation, show_saved, document_id],
  );

  /**
   * Handle title changes with debounced save.
   */
  const handle_title_change = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const new_title = e.target.value;
      set_title(new_title);

      if (title_timer_ref.current) {
        clearTimeout(title_timer_ref.current);
      }

      title_timer_ref.current = setTimeout(async () => {
        if (!new_title.trim()) return;
        set_save_status("saving");
        try {
          await save_mutation.mutateAsync({ title: new_title.trim() });
          if (document_id) update_tab_title(document_id, new_title.trim());
          show_saved();
        } catch {
          set_save_status("error");
        }
      }, TITLE_SAVE_DELAY_MS);
    },
    [save_mutation, show_saved, document_id, update_tab_title],
  );

  /**
   * Handle title blur — save immediately if changed.
   */
  const handle_title_blur = useCallback(async () => {
    set_is_title_focused(false);
    if (title_timer_ref.current) {
      clearTimeout(title_timer_ref.current);
    }
    const trimmed = title.trim();
    if (trimmed && trimmed !== document?.title) {
      set_save_status("saving");
      try {
        await save_mutation.mutateAsync({ title: trimmed });
        if (document_id) update_tab_title(document_id, trimmed);
        show_saved();
      } catch {
        set_save_status("error");
      }
    }
    if (!trimmed) {
      set_title(document?.title || "Untitled");
    }
  }, [title, document?.title, save_mutation, show_saved, document_id, update_tab_title]);

  /**
   * Convert agent plain-text proposals into Tiptap-friendly HTML.
   */
  const to_editor_html = useCallback((proposed_text: string): string => {
    return proposed_text
      .split(/\n{2,}/)
      .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
      .join("");
  }, []);

  /**
   * Apply editor content from UI-driven preview/revert flows.
   */
  const apply_editor_content_without_save = useCallback((next_content: string): boolean => {
    if (!editor_ref.current || editor_ref.current.isDestroyed) return false;
    // We emit the update so the React view re-renders properly.
    // Autosaves during preview are blocked by checking use_ai_store.getState().pending_document_change.
    return editor_ref.current.commands.setContent(next_content);
  }, []);

  /**
   * Try to apply the pending preview to the editor exactly once per payload.
   * Returns false when the editor is not ready yet.
   */
  const apply_pending_preview_if_needed = useCallback(
    (next_pending_change: DocumentChangePayload): boolean => {
      if (!editor_ref.current || editor_ref.current.isDestroyed) {
        return false;
      }

      const preview_key = `${next_pending_change.original_text ?? ""}__${next_pending_change.proposed_text}`;
      if (applied_preview_key_ref.current === preview_key) {
        return true;
      }

      if (original_content_ref.current === null) {
        original_content_ref.current = editor_ref.current.getHTML();
      }

      const html = to_editor_html(next_pending_change.proposed_text);
      const was_applied = apply_editor_content_without_save(
        html || next_pending_change.proposed_text,
      );
      if (!was_applied) {
        return false;
      }

      applied_preview_key_ref.current = preview_key;
      return true;
    },
    [to_editor_html, apply_editor_content_without_save],
  );

  /**
   * If a pending change arrives before the editor is fully ready, apply it as
   * soon as the editor instance becomes available.
   */
  useEffect(() => {
    if (pending_change === null) return;
    apply_pending_preview_if_needed(pending_change);
  }, [pending_change, editor_instance, apply_pending_preview_if_needed]);

  /**
   * Reject the current pending change and restore the original editor content.
   */
  const handle_reject_pending_change = useCallback(() => {
    if (original_content_ref.current !== null) {
      apply_editor_content_without_save(original_content_ref.current);
    }

    original_content_ref.current = null;
    applied_preview_key_ref.current = null;
    set_pending_document_change(null);
    set_resolve_pending_change_token((prev) => prev + 1);
  }, [apply_editor_content_without_save, set_pending_document_change]);

  /**
   * Accept the pending change currently previewed in the editor.
   * The previewed content is already visible, so this action simply commits it
   * to autosave and clears review state.
   */
  const handle_accept_pending_change = useCallback(() => {
    if (pending_change !== null && editor_ref.current && !editor_ref.current.isDestroyed) {
      const html = to_editor_html(pending_change.proposed_text);
      const was_applied = apply_editor_content_without_save(html || pending_change.proposed_text);
      if (!was_applied) {
        set_save_status("error");
        return;
      }

      // Clear pending state first so handle_update allows the save to go through
      set_pending_document_change(null);
      original_content_ref.current = null;
      applied_preview_key_ref.current = null;
      set_resolve_pending_change_token((prev) => prev + 1);

      handle_update(editor_ref.current.getJSON(), editor_ref.current.getText());
      return;
    }

    original_content_ref.current = null;
    applied_preview_key_ref.current = null;
    set_pending_document_change(null);
    set_resolve_pending_change_token((prev) => prev + 1);
  }, [
    pending_change,
    to_editor_html,
    apply_editor_content_without_save,
    handle_update,
    set_pending_document_change,
  ]);

  /** Navigate back to the document list. */
  function handle_back() {
    navigate("/documents");
  }

  /* Loading state */
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
      </div>
    );
  }

  /* Error state */
  if (error || !document) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <AlertCircle className="h-8 w-8 text-error" />
        <p className="text-ui-base text-error">{error?.message ?? "Document not found"}</p>
        <Button variant="ghost" size="md" onClick={handle_back}>
          <ArrowLeft className="h-4 w-4" />
          Back to documents
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-app">
      {/* Sub-header: back button + document title + save status */}
      <div className="flex w-full shrink-0 items-center gap-3 px-4 py-2 border-b border-border-subtle bg-surface z-20">
        <Button
          variant="ghost"
          size="sm"
          onClick={handle_back}
          className="hover:bg-border-subtle/50"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Documents</span>
        </Button>

        {/* Editable document title */}
        <input
          type="text"
          value={title}
          onChange={handle_title_change}
          onFocus={() => set_is_title_focused(true)}
          onBlur={handle_title_blur}
          placeholder="Untitled"
          className="min-w-0 max-w-sm bg-transparent border-none outline-none font-ui text-ui-lg font-semibold text-text-primary placeholder:text-text-secondary/50 focus:border-b-2 focus:border-accent-main px-1 py-0.5 transition-all"
          aria-label="Document title"
        />

        {/* Save status indicator */}
        <div className="ml-auto">
          <SaveStatusIndicator status={save_status} />
        </div>
      </div>

      {/* Main content row: editor + optional AI panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor Region */}
        <div className="relative flex-1 overflow-hidden">
          {pending_change !== null && (
            <DocumentChangeReviewOverlay
              pending_change={pending_change}
              on_accept={handle_accept_pending_change}
              on_reject={handle_reject_pending_change}
            />
          )}

          <CaretEditor
            content={document.content_json as JSONContent | undefined}
            on_update={handle_update}
            on_editor_ready={(ed) => {
              editor_ref.current = ed;
              set_editor_instance(ed);
              if (pending_document_change !== null) {
                apply_pending_preview_if_needed(pending_document_change);
              }
            }}
          />
        </div>

        {/* AI Chat Panel — rendered via React.lazy, only mounted when open */}
        {is_panel_open && (
          <Suspense fallback={null}>
            <ChatPanel
              document_id={document_id ?? ""}
              get_document_context={() => editor_ref.current?.getText() || undefined}
              resolve_pending_change_token={resolve_pending_change_token}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

/**
 * Props for the save status indicator component.
 */
interface SaveStatusIndicatorProps {
  /** Current save status. */
  status: SaveStatus;
}

/**
 * Displays the current autosave status as a small label with icon.
 *
 * @param props - Component props containing the current save status.
 * @returns Rendered status indicator or null when idle.
 */
function SaveStatusIndicator({ status }: SaveStatusIndicatorProps) {
  if (status === "idle") {
    return null;
  }

  const config: Record<
    Exclude<SaveStatus, "idle">,
    { label: string; icon: React.ReactNode; class_name: string }
  > = {
    saving: {
      label: "Saving...",
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      class_name: "text-text-secondary",
    },
    saved: {
      label: "Saved",
      icon: <Check className="h-3.5 w-3.5" />,
      class_name: "text-text-secondary",
    },
    error: {
      label: "Error saving",
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      class_name: "text-error",
    },
  };

  const { label, icon, class_name } = config[status];

  return (
    <span className={`flex shrink-0 items-center gap-1.5 text-ui-sm ${class_name}`}>
      {icon}
      {label}
    </span>
  );
}
