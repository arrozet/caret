import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Loader2,
  ArrowLeft,
  Check,
  AlertCircle,
  Sparkles,
  UserPlus,
  MoveRight,
} from "lucide-react";
import type { JSONContent, Editor } from "@tiptap/react";
import { CaretEditor } from "./CaretEditor";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { useDocument } from "../hooks/useDocument";
import { useSaveDocument } from "../hooks/useSaveDocument";
import { useInviteDocumentCollaborator } from "../hooks/useInviteDocumentCollaborator";
import { useInviteWorkspaceCollaborator } from "../hooks/useInviteWorkspaceCollaborator";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { updateDocument } from "../api/documentApi";
import { useFocusMode } from "../../../hooks/useFocusMode";
import { useTabsStore, useAiStore, useAuthStore } from "../../../stores";
import { useGhostText } from "../hooks/useGhostText";
import {
  convert_ai_content_to_tiptap_json,
  replace_collaboration_document_content,
} from "../utils";
import { indexDocumentEmbeddings } from "../../ai-assistant/api/aiApi";
import type { DocumentChangePayload, DocumentContextSnapshot } from "../../ai-assistant/api/aiApi";
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

interface DiffLine {
  type: "equal" | "removed" | "added";
  text: string;
}

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

interface DocumentChangeReviewOverlayProps {
  pending_change: DocumentChangePayload;
  on_accept: () => void;
  on_reject: () => void;
  is_accepting?: boolean;
}

/**
 * Floating review card rendered directly over the editor canvas.
 * Shows a git-style inline diff and explicit Accept/Reject actions.
 */
function DocumentChangeReviewOverlay({
  pending_change,
  on_accept,
  on_reject,
  is_accepting = false,
}: DocumentChangeReviewOverlayProps) {
  const full_diff = compute_line_diff(
    pending_change.original_text ?? "",
    pending_change.proposed_text,
  );

  const added_count = full_diff.filter((line) => line.type === "added").length;
  const removed_count = full_diff.filter((line) => line.type === "removed").length;

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

        {/* Inline diff preview so the user can see exactly what changes */}
        <div className="max-h-48 overflow-y-auto border-b border-border-subtle px-3 py-2 font-mono text-ui-xs leading-relaxed">
          {full_diff.map((line, idx) => {
            if (line.type === "equal") {
              return (
                <div key={idx} className="text-text-secondary">
                  {"  "}
                  {line.text || "\u00a0"}
                </div>
              );
            }
            if (line.type === "removed") {
              return (
                <div key={idx} className="text-diff-del-text bg-diff-del-bg/30 line-through">
                  - {line.text || "\u00a0"}
                </div>
              );
            }
            return (
              <div key={idx} className="text-accent-main bg-diff-add-bg/30">
                + {line.text || "\u00a0"}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 px-3 py-2">
          <button
            onClick={on_reject}
            disabled={is_accepting}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-ui-xs font-medium text-text-secondary hover:bg-app transition-colors"
          >
            Reject
          </button>
          <button
            onClick={on_accept}
            disabled={is_accepting}
            className="flex items-center gap-1.5 rounded-md bg-accent-ai px-3 py-1.5 text-ui-xs font-medium text-white hover:bg-accent-ai/90 transition-colors"
          >
            <Check className="h-3 w-3" />
            {is_accepting ? "Applying..." : "Accept"}
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
  const auth_user = useAuthStore((state) => state.user);
  const auth_session = useAuthStore((state) => state.session);

  const { data: document, isLoading, error } = useDocument(document_id);
  const save_mutation = useSaveDocument(document_id ?? "");
  const { data: workspaces = [] } = useWorkspaces();
  const document_invite_mutation = useInviteDocumentCollaborator(document_id ?? "");
  const workspace_invite_mutation = useInviteWorkspaceCollaborator(document?.workspace_id ?? "");

  const [save_status, set_save_status] = useState<SaveStatus>("idle");
  const [title, set_title] = useState("");
  const [is_title_focused, set_is_title_focused] = useState(false);
  const [is_invite_dialog_open, set_is_invite_dialog_open] = useState(false);
  const [is_move_dialog_open, set_is_move_dialog_open] = useState(false);
  const [invite_email, set_invite_email] = useState("");
  const [invite_error, set_invite_error] = useState<string | null>(null);
  const [invite_success, set_invite_success] = useState<string | null>(null);
  const [share_scope, set_share_scope] = useState<"workspace" | "document">("workspace");
  const [move_workspace_id, set_move_workspace_id] = useState("");
  const [move_error, set_move_error] = useState<string | null>(null);
  const [is_accepting_change, set_is_accepting_change] = useState(false);
  const debounce_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const title_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved_indicator_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor_ref = useRef<Editor | null>(null);
  const last_known_document_context_ref = useRef<DocumentContextSnapshot | null>(null);

  const [resolve_pending_change_token, set_resolve_pending_change_token] = useState(0);

  const [editor_instance, set_editor_instance] = useState<Editor | null>(null);

  const current_workspace =
    workspaces.find((workspace) => workspace.id === document?.workspace_id) ?? null;
  const current_workspace_kind =
    current_workspace?.kind ?? (document?.visibility === "workspace" ? "shared" : "personal");
  const shared_workspaces = workspaces.filter((workspace) => workspace.kind === "shared");

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

  function openShareDialog() {
    set_is_invite_dialog_open(true);
    set_invite_email("");
    set_invite_error(null);
    set_invite_success(null);
    set_share_scope("workspace");
  }

  function closeShareDialog() {
    set_is_invite_dialog_open(false);
    set_invite_error(null);
    set_invite_success(null);
  }

  function openMoveDialog() {
    set_is_move_dialog_open(true);
    set_move_error(null);
    set_move_workspace_id(shared_workspaces[0]?.id ?? "");
  }

  function closeMoveDialog() {
    set_is_move_dialog_open(false);
    set_move_error(null);
  }

  async function handleShareSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized_email = invite_email.trim().toLowerCase();
    set_invite_error(null);
    set_invite_success(null);
    try {
      if (share_scope === "workspace") {
        await workspace_invite_mutation.mutateAsync({ email: normalized_email });
      } else {
        await document_invite_mutation.mutateAsync({ email: normalized_email });
      }
      set_invite_success(`Invitation sent to ${normalized_email || "collaborator"}.`);
      set_invite_email("");
    } catch (err) {
      set_invite_success(null);
      set_invite_error(err instanceof Error ? err.message : "Failed to invite collaborator.");
    }
  }

  async function handleMoveSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!document_id || !move_workspace_id) {
      return;
    }

    set_move_error(null);
    try {
      await updateDocument(document_id, {
        workspace_id: move_workspace_id,
        folder_id: null,
      });
      closeMoveDialog();
    } catch (err) {
      set_move_error(err instanceof Error ? err.message : "Failed to move document.");
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
          {current_workspace_kind === "shared" ? (
            <Button variant="secondary" size="sm" onClick={openShareDialog} className="inline-flex">
              <UserPlus className="h-4 w-4" />
              Share
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={openMoveDialog} className="inline-flex">
              <MoveRight className="h-4 w-4" />
              Move to workspace
            </Button>
          )}
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
            <DocumentChangeReviewOverlay
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

      {is_invite_dialog_open && current_workspace_kind === "shared" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={closeShareDialog}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-5 shadow-elevated"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-ui-lg font-semibold text-text-primary">Share document</h2>
            <p className="mt-1 text-ui-sm text-text-secondary">
              Invite someone to the workspace or directly to this document.
            </p>

            <form className="mt-4 space-y-4" onSubmit={handleShareSubmit}>
              <Input
                id="invite-email"
                type="email"
                label="Email"
                placeholder="juan@nombre.es"
                value={invite_email}
                onChange={(event) => set_invite_email(event.target.value)}
                autoFocus
              />

              <fieldset className="space-y-2">
                <legend className="text-ui-sm font-medium text-text-primary">Share scope</legend>
                <label className="flex items-center gap-3 rounded-[4px] border border-border-subtle px-3 py-2 text-ui-sm text-text-primary">
                  <input
                    type="radio"
                    name="share-scope"
                    checked={share_scope === "workspace"}
                    onChange={() => set_share_scope("workspace")}
                  />
                  Workspace
                </label>
                <label className="flex items-center gap-3 rounded-[4px] border border-border-subtle px-3 py-2 text-ui-sm text-text-primary">
                  <input
                    type="radio"
                    name="share-scope"
                    checked={share_scope === "document"}
                    onChange={() => set_share_scope("document")}
                  />
                  Document
                </label>
              </fieldset>

              {invite_error !== null ? (
                <p className="text-ui-sm text-error" role="alert">
                  {invite_error}
                </p>
              ) : null}

              {invite_success !== null ? (
                <p className="text-ui-sm text-accent-main" role="status">
                  {invite_success}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={closeShareDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={
                    share_scope === "workspace"
                      ? workspace_invite_mutation.isPending
                      : document_invite_mutation.isPending
                  }
                >
                  Send invite
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {is_move_dialog_open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={closeMoveDialog}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-5 shadow-elevated"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-ui-lg font-semibold text-text-primary">Move document</h2>
            <p className="mt-1 text-ui-sm text-text-secondary">
              Choose a shared workspace for this document.
            </p>

            <form className="mt-4 space-y-4" onSubmit={handleMoveSubmit}>
              <fieldset className="space-y-2">
                <legend className="text-ui-sm font-medium text-text-primary">
                  Target workspace
                </legend>
                {shared_workspaces.length > 0 ? (
                  shared_workspaces.map((workspace) => (
                    <label
                      key={workspace.id}
                      className="flex items-center gap-3 rounded-[4px] border border-border-subtle px-3 py-2 text-ui-sm text-text-primary"
                    >
                      <input
                        type="radio"
                        name="move-workspace"
                        checked={move_workspace_id === workspace.id}
                        onChange={() => set_move_workspace_id(workspace.id)}
                      />
                      {workspace.name}
                    </label>
                  ))
                ) : (
                  <p className="text-ui-sm text-text-secondary">Create a shared workspace first.</p>
                )}
              </fieldset>

              {move_error !== null ? (
                <p className="text-ui-sm text-error" role="alert">
                  {move_error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={closeMoveDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={false}
                  disabled={!move_workspace_id || shared_workspaces.length === 0}
                >
                  Move document
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
