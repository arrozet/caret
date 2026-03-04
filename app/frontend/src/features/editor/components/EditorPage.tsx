import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Check, AlertCircle } from "lucide-react";
import type { JSONContent, Editor } from "@tiptap/react";
import { CaretEditor } from "./CaretEditor";
import { Button } from "../../../components/ui/Button";
import { use_document } from "../hooks/use_document";
import { use_save_document } from "../hooks/use_save_document";
import { use_focus_mode } from "../../../hooks/use_focus_mode";
import { use_tabs_store } from "../../../stores/tabs_store";
import { use_ai_store } from "../../../stores";

/**
 * Lazy-load the AI Chat Panel to keep the initial bundle lean.
 * The panel is only rendered when the user opens it via Ctrl/Cmd+K.
 */
const ChatPanel = lazy(() =>
  import("../../ai-assistant").then((m) => ({ default: m.ChatPanel })),
);

/** Debounce delay in milliseconds before autosaving after the last keystroke. */
const AUTOSAVE_DELAY_MS = 1_000;

/** Debounce delay for title saves (shorter since it's a single field). */
const TITLE_SAVE_DELAY_MS = 500;

/** Possible states for the save status indicator. */
type SaveStatus = "idle" | "saving" | "saved" | "error";

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
  const saved_indicator_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  /** Ref to the Tiptap Editor instance, used to extract document context for AI. */
  const editor_ref = useRef<Editor | null>(null);

  const { add_tab, update_tab_title } = use_tabs_store();

  /** AI panel state from the global store. */
  const { is_panel_open, toggle_panel } = use_ai_store();

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
   */
  const handle_update = useCallback(
    (json: JSONContent, text: string) => {
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
        } catch {
          set_save_status("error");
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [save_mutation, show_saved],
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
        <p className="text-ui-base text-error">
          {error?.message ?? "Document not found"}
        </p>
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
        <Button variant="ghost" size="sm" onClick={handle_back} className="hover:bg-border-subtle/50">
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
        <div className="flex-1 overflow-hidden">
          <CaretEditor
            content={document.content_json as JSONContent | undefined}
            on_update={handle_update}
            on_editor_ready={(ed) => {
              editor_ref.current = ed;
            }}
          />
        </div>

        {/* AI Chat Panel — rendered via React.lazy, only mounted when open */}
        {is_panel_open && (
          <Suspense fallback={null}>
            <ChatPanel
              document_id={document_id ?? ""}
              document_context={editor_ref.current?.getText() ?? undefined}
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
