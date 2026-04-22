import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Check, AlertCircle, UserPlus } from "lucide-react";
import type { JSONContent, Editor } from "@tiptap/react";
import { CaretEditor } from "./CaretEditor";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { useDocument } from "../hooks/useDocument";
import { useSaveDocument } from "../hooks/useSaveDocument";
import { useInviteDocumentCollaborator } from "../hooks/useInviteDocumentCollaborator";
import { useFocusMode } from "../../../hooks/useFocusMode";
import { useTabsStore, useAiStore, useAuthStore } from "../../../stores";
import { useGhostText } from "../hooks/useGhostText";
import {
  convert_ai_content_to_tiptap_json,
  replace_collaboration_document_content,
} from "../utils";
import { indexDocumentEmbeddings } from "../../ai-assistant/api/aiApi";
import type { DocumentContextSnapshot } from "../../ai-assistant/api/aiApi";
import { DocumentSuggestionPreview } from "./DocumentSuggestionPreview";
import {
  CollaborationPresenceBar,
  LOCAL_COLLAB_WS_BASE_URL,
  useCollaborationPresence,
  useCollaborationSession,
} from "../../collaboration";

const ChatPanel = lazy(() => import("../../ai-assistant").then((m) => ({ default: m.ChatPanel })));

/** Debounce delay in milliseconds before autosaving after the last keystroke. */
const AUTOSAVE_DELAY_MS = 1_000;

/** Debounce delay for title saves (shorter since it's a single field). */
const TITLE_SAVE_DELAY_MS = 500;

function isCollaborationEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_COLLABORATION !== "false";
}

function getCollaborationWsUrl(): string {
  return (
    (import.meta.env.VITE_COLLABORATION_WS_URL as string | undefined) ?? LOCAL_COLLAB_WS_BASE_URL
  );
}

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
  const auth_user = useAuthStore((state) => state.user);
  const auth_session = useAuthStore((state) => state.session);

  const { data: document, isLoading, error } = useDocument(document_id);
  const save_mutation = useSaveDocument(document_id ?? "");
  const invite_collaborator_mutation = useInviteDocumentCollaborator(document_id ?? "");

  const [save_status, set_save_status] = useState<SaveStatus>("idle");
  const [title, set_title] = useState("");
  const [is_title_focused, set_is_title_focused] = useState(false);
  const [is_invite_dialog_open, set_is_invite_dialog_open] = useState(false);
  const [invite_email, set_invite_email] = useState("");
  const [invite_error, set_invite_error] = useState<string | null>(null);
  const [invite_success, set_invite_success] = useState<string | null>(null);
  const [is_accepting_change, set_is_accepting_change] = useState(false);
  const debounce_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const title_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved_indicator_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor_ref = useRef<Editor | null>(null);
  const last_known_document_context_ref = useRef<DocumentContextSnapshot | null>(null);

  const [resolve_pending_change_token, set_resolve_pending_change_token] = useState(0);

  const [editor_instance, set_editor_instance] = useState<Editor | null>(null);

  const collaboration_enabled =
    isCollaborationEnabled() &&
    Boolean(document_id) &&
    Boolean(auth_user?.id) &&
    Boolean(auth_session?.access_token);

  const collaboration_session = useCollaborationSession({
    enabled: collaboration_enabled,
    document_id,
    token: auth_session?.access_token,
    user_id: auth_user?.id,
    user_name:
      auth_user?.user_metadata?.full_name ?? auth_user?.email ?? auth_user?.id ?? "Collaborator",
    server_url: getCollaborationWsUrl(),
    initial_content: (document?.content_json as JSONContent | null | undefined) ?? null,
  });

  const collaboration_presence = useCollaborationPresence(collaboration_session.users);

  const { addTab, updateTabTitle } = useTabsStore();

  const {
    isPanelOpen,
    togglePanel,
    activeDocumentId,
    activeConversationId,
    setActiveDocumentId,
    pendingDocumentChange,
    setPendingDocumentChange,
  } = useAiStore();
  const pending_change = pendingDocumentChange;

  const debug_log = useCallback((event: string, payload?: unknown) => {
    if (typeof window === "undefined") return;
    if (!(window as Window & { __caret_debug?: boolean }).__caret_debug) return;
    if (payload === undefined) {
      console.log(`[caret/editor] ${event}`);
      return;
    }
    console.log(`[caret/editor] ${event}`, payload);
  }, []);

  const remember_document_context = useCallback(
    (context: DocumentContextSnapshot | null | undefined) => {
      if (!context) return;
      last_known_document_context_ref.current = {
        content_json: context.content_json,
        content_text: context.content_text,
      };
    },
    [],
  );

  const build_persisted_document_context = useCallback((): DocumentContextSnapshot | undefined => {
    if (!document) return undefined;
    return {
      content_json: document.content_json ?? { type: "doc", content: [{ type: "paragraph" }] },
      content_text: document.content_text ?? "",
    };
  }, [document]);

  useEffect(() => {
    const persisted = build_persisted_document_context();
    if (persisted) remember_document_context(persisted);
  }, [build_persisted_document_context, remember_document_context]);

  const get_active_editor = useCallback((): Editor | null => {
    if (editor_ref.current && !editor_ref.current.isDestroyed) {
      return editor_ref.current;
    }
    if (editor_instance && !editor_instance.isDestroyed) {
      editor_ref.current = editor_instance;
      return editor_instance;
    }
    return null;
  }, [editor_instance]);

  /**
   * While a pending change is visible, return the cached pre-change snapshot
   * so the AI doesn't accidentally read any in-flight diff state.
   */
  const get_document_context_snapshot = useCallback((): DocumentContextSnapshot | undefined => {
    if (pending_change !== null && last_known_document_context_ref.current) {
      return last_known_document_context_ref.current;
    }

    const active_editor = get_active_editor();
    if (active_editor) {
      const selection = active_editor.state.selection;
      const live_context = {
        content_json: active_editor.getJSON(),
        content_text: active_editor.getText(),
        selection: selection.empty
          ? undefined
          : {
              from: selection.from,
              to: selection.to,
              text: active_editor.state.doc.textBetween(selection.from, selection.to, " "),
            },
      } satisfies DocumentContextSnapshot;
      remember_document_context(live_context);
      return live_context;
    }

    if (last_known_document_context_ref.current) return last_known_document_context_ref.current;

    const persisted = build_persisted_document_context();
    if (persisted) {
      remember_document_context(persisted);
      return persisted;
    }
    return undefined;
  }, [
    build_persisted_document_context,
    get_active_editor,
    pending_change,
    remember_document_context,
  ]);

  useEffect(() => {
    if (!document_id) return;
    if (activeDocumentId !== null && activeDocumentId !== document_id) {
      setPendingDocumentChange(null);
    }
    setActiveDocumentId(document_id);
  }, [document_id, activeDocumentId, setActiveDocumentId, setPendingDocumentChange]);

  useEffect(() => {
    if (editor_instance && !editor_instance.isDestroyed) {
      editor_ref.current = editor_instance;
    }
  }, [editor_instance]);

  useGhostText({
    editor: editor_instance,
    conversationId: activeConversationId,
    documentId: document_id ?? null,
  });
  useFocusMode(true);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        togglePanel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePanel]);

  useEffect(() => {
    if (document?.title && !is_title_focused) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      set_title(document.title);
    }
  }, [document?.title, is_title_focused]);

  useEffect(() => {
    if (document_id && document?.title) {
      addTab({ id: document_id, title: document.title });
      updateTabTitle(document_id, document.title);
    }
  }, [document_id, document?.title, addTab, updateTabTitle]);

  useEffect(() => {
    return () => {
      if (debounce_timer_ref.current) clearTimeout(debounce_timer_ref.current);
      if (title_timer_ref.current) clearTimeout(title_timer_ref.current);
      if (saved_indicator_timer_ref.current) clearTimeout(saved_indicator_timer_ref.current);
    };
  }, []);

  const show_saved = useCallback(() => {
    set_save_status("saved");
    if (saved_indicator_timer_ref.current) clearTimeout(saved_indicator_timer_ref.current);
    saved_indicator_timer_ref.current = setTimeout(() => set_save_status("idle"), 2_000);
  }, [set_save_status]);

  const handleUpdate = useCallback(
    (json: JSONContent, text: string) => {
      if (useAiStore.getState().pendingDocumentChange !== null) {
        debug_log("handle_update.blocked_by_pending_change");
        return;
      }

      remember_document_context({ content_json: json, content_text: text });

      if (debounce_timer_ref.current) clearTimeout(debounce_timer_ref.current);

      debounce_timer_ref.current = setTimeout(async () => {
        set_save_status("saving");
        try {
          await save_mutation.mutateAsync({
            content_json: json as Record<string, unknown>,
            content_text: text,
          });
          show_saved();
          if (document_id && text.trim()) {
            indexDocumentEmbeddings(document_id, text).catch(() => {});
          }
        } catch {
          set_save_status("error");
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [save_mutation, show_saved, document_id, debug_log, remember_document_context, set_save_status],
  );

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const new_title = e.target.value;
      set_title(new_title);
      if (title_timer_ref.current) clearTimeout(title_timer_ref.current);
      title_timer_ref.current = setTimeout(async () => {
        if (!new_title.trim()) return;
        set_save_status("saving");
        try {
          await save_mutation.mutateAsync({ title: new_title.trim() });
          if (document_id) updateTabTitle(document_id, new_title.trim());
          show_saved();
        } catch {
          set_save_status("error");
        }
      }, TITLE_SAVE_DELAY_MS);
    },
    [save_mutation, show_saved, document_id, updateTabTitle, set_title, set_save_status],
  );

  const handleTitleBlur = async () => {
    set_is_title_focused(false);
    if (title_timer_ref.current) clearTimeout(title_timer_ref.current);
    const trimmed = title.trim();
    if (trimmed && trimmed !== document?.title) {
      set_save_status("saving");
      try {
        await save_mutation.mutateAsync({ title: trimmed });
        if (document_id) updateTabTitle(document_id, trimmed);
        show_saved();
      } catch {
        set_save_status("error");
      }
    }
    if (!trimmed) set_title(document?.title || "Untitled");
  };

  const handleRejectPendingChange = useCallback(() => {
    set_is_accepting_change(false);
    setPendingDocumentChange(null);
    set_resolve_pending_change_token((prev) => prev + 1);
  }, [setPendingDocumentChange, set_is_accepting_change, set_resolve_pending_change_token]);

  /**
   * Accept the pending AI change.
   *
   * In collaboration mode the shared Y.Doc is the source of truth, so the
   * change must be written into the collaboration fragment directly.
   * Outside collaboration we can fall back to the local editor command API.
   */
  const handleAcceptPendingChange = useCallback(() => {
    if (is_accepting_change) return;
    set_is_accepting_change(true);

    const active_editor = get_active_editor();
    const collaboration_document = collaboration_session.ydoc;
    debug_log("handle_accept_pending_change.clicked", {
      has_pending: pending_change !== null,
      has_active_editor: Boolean(active_editor),
      has_collaboration_document: collaboration_document !== null,
    });

    if (pending_change !== null && (active_editor || collaboration_document !== null)) {
      const proposed_text = pending_change.proposed_text.replace(/\r\n/g, "\n").trim();
      const proposed_json = convert_ai_content_to_tiptap_json(proposed_text);

      debug_log("handle_accept_pending_change.applying", {
        text_length: proposed_text.length,
        paragraph_count: proposed_json.content?.length ?? 0,
        collaboration_enabled: collaboration_document !== null,
      });

      // Clear AI state before mutating the document so the autosave path isn't blocked.
      setPendingDocumentChange(null);
      set_resolve_pending_change_token((prev) => prev + 1);
      remember_document_context({
        content_json: proposed_json,
        content_text: proposed_text,
      });

      const applied_to_collaboration =
        collaboration_document !== null
          ? replace_collaboration_document_content(collaboration_document, proposed_json)
          : false;

      if (!applied_to_collaboration && active_editor) {
        active_editor.commands.setContent(proposed_json);
      }

      set_is_accepting_change(false);
      return;
    }

    setPendingDocumentChange(null);
    set_resolve_pending_change_token((prev) => prev + 1);
    set_is_accepting_change(false);
  }, [
    is_accepting_change,
    pending_change,
    get_active_editor,
    collaboration_session.ydoc,
    debug_log,
    remember_document_context,
    setPendingDocumentChange,
    set_is_accepting_change,
    set_resolve_pending_change_token,
  ]);

  function handle_back() {
    navigate("/documents");
  }

  function openInviteDialog() {
    set_is_invite_dialog_open(true);
    set_invite_email("");
    set_invite_error(null);
    set_invite_success(null);
  }

  function closeInviteDialog() {
    set_is_invite_dialog_open(false);
    set_invite_error(null);
    set_invite_success(null);
  }

  async function handleInviteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized_email = invite_email.trim().toLowerCase();
    if (!normalized_email) {
      set_invite_success(null);
      set_invite_error("Email is required.");
      return;
    }
    set_invite_error(null);
    set_invite_success(null);
    try {
      await invite_collaborator_mutation.mutateAsync({ email: normalized_email });
      set_invite_success(`Invitation sent to ${normalized_email}.`);
      set_invite_email("");
    } catch (err) {
      set_invite_success(null);
      set_invite_error(err instanceof Error ? err.message : "Failed to invite collaborator.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
      </div>
    );
  }

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

        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          onFocus={() => set_is_title_focused(true)}
          onBlur={handleTitleBlur}
          placeholder="Untitled"
          className="min-w-0 max-w-sm bg-transparent border-none outline-none font-ui text-ui-lg font-semibold text-text-primary placeholder:text-text-secondary/50 focus:border-b-2 focus:border-accent-main px-1 py-0.5 transition-all"
          aria-label="Document title"
        />

        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={openInviteDialog} className="inline-flex">
            <UserPlus className="h-4 w-4" />
            Invite
          </Button>
          {collaboration_enabled && (
            <CollaborationPresenceBar
              connection_status={collaboration_session.connection_status}
              users={collaboration_presence.users}
              class_name="hidden md:block"
            />
          )}
          <SaveStatusIndicator status={save_status} />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 overflow-hidden">
          {pending_change !== null && (
            <DocumentSuggestionPreview
              pending_change={pending_change}
              on_accept={handleAcceptPendingChange}
              on_reject={handleRejectPendingChange}
              is_accepting={is_accepting_change}
            />
          )}

          <CaretEditor
            content={document.content_json as JSONContent | undefined}
            onUpdate={handleUpdate}
            collaborationDocument={collaboration_session.ydoc}
            onEditorReady={(ed) => {
              editor_ref.current = ed;
              set_editor_instance(ed);
            }}
          />
        </div>

        {isPanelOpen && (
          <Suspense fallback={null}>
            <ChatPanel
              document_id={document_id ?? ""}
              get_document_context={get_document_context_snapshot}
              resolve_pending_change_token={resolve_pending_change_token}
            />
          </Suspense>
        )}
      </div>

      {is_invite_dialog_open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={closeInviteDialog}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-5 shadow-elevated"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-ui-lg font-semibold text-text-primary">Invite collaborator</h2>
            <p className="mt-1 text-ui-sm text-text-secondary">
              Enter an email from an existing Caret account.
            </p>

            <form className="mt-4 space-y-3" onSubmit={handleInviteSubmit}>
              <Input
                id="invite-email"
                type="email"
                label="Email"
                placeholder="juan@nombre.es"
                value={invite_email}
                onChange={(event) => set_invite_email(event.target.value)}
                autoFocus
              />

              {invite_error !== null && (
                <p className="text-ui-sm text-error" role="alert">
                  {invite_error}
                </p>
              )}

              {invite_success !== null && (
                <p className="text-ui-sm text-accent-main" role="status">
                  {invite_success}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={closeInviteDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={invite_collaborator_mutation.isPending}
                >
                  Send invite
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface SaveStatusIndicatorProps {
  status: SaveStatus;
}

function SaveStatusIndicator({ status }: SaveStatusIndicatorProps) {
  if (status === "idle") return null;

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
