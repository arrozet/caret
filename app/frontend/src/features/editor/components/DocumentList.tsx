import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ChevronLeft,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileText,
  Folder,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { NotificationToast } from "../../../components/ui/NotificationToast";
import type { DocumentResponse, FolderResponse, WorkspaceResponse } from "../api/documentApi";
import { useCreateDocument } from "../hooks/useCreateDocument";
import { useCreateFolder } from "../hooks/useCreateFolder";
import { useDeleteDocument } from "../hooks/useDeleteDocument";
import { useDeleteFolder } from "../hooks/useDeleteFolder";
import { useDeleteWorkspace } from "../hooks/useDeleteWorkspace";
import { useFolders } from "../hooks/useFolders";
import { useInviteWorkspaceCollaborator } from "../hooks/useInviteWorkspaceCollaborator";
import { useMoveDocument } from "../hooks/useMoveDocument";
import { useUpdateDocument } from "../hooks/useUpdateDocument";
import { useUpdateFolder } from "../hooks/useUpdateFolder";
import { useUpdateWorkspace } from "../hooks/useUpdateWorkspace";
import { useDocuments, useSharedDocuments } from "../hooks/useDocuments";
import { useCreateWorkspace, useWorkspaces } from "../hooks/useWorkspaces";

interface MoveTarget {
  document: DocumentResponse;
  workspace_id: string;
  folder_id: string | null;
  return_focus_to: HTMLElement | null;
}

interface RenameWorkspaceState {
  workspace: WorkspaceResponse;
  name: string;
  return_focus_to: HTMLElement | null;
}

interface DeleteWorkspaceState {
  workspace: WorkspaceResponse;
  return_focus_to: HTMLElement | null;
}

interface DeleteDocumentState {
  document: DocumentResponse;
  return_focus_to: HTMLElement | null;
}

interface RenameDocumentState {
  document: DocumentResponse;
  name: string;
  return_focus_to: HTMLElement | null;
}

/**
 * Documents home page.
 *
 * Groups the user's content into personal workspaces, shared workspaces,
 * and directly shared documents.
 */
export function DocumentList() {
  const navigate = useNavigate();
  const location = useLocation();
  const page_heading_ref = useRef<HTMLHeadingElement | null>(null);

  const location_state = location.state as
    | { workspace_id?: string; folder_id?: string | null }
    | null
    | undefined;

  const { data: workspaces = [], isLoading: workspaces_loading } = useWorkspaces();
  const { data: shared_documents = [], isLoading: shared_documents_loading } = useSharedDocuments();
  const create_workspace_mutation = useCreateWorkspace();
  const update_workspace_mutation = useUpdateWorkspace();
  const delete_workspace_mutation = useDeleteWorkspace();
  const delete_document_mutation = useDeleteDocument();
  const update_document_mutation = useUpdateDocument();

  const [toast_message, set_toast_message] = useState<string | null>(null);
  const [move_target, set_move_target] = useState<MoveTarget | null>(null);
  const [move_workspace_id, set_move_workspace_id] = useState("");
  const [move_folder_id, set_move_folder_id] = useState<string | null>(null);
  const [rename_workspace, set_rename_workspace] = useState<RenameWorkspaceState | null>(null);
  const [delete_workspace, set_delete_workspace] = useState<DeleteWorkspaceState | null>(null);
  const [delete_document, set_delete_document] = useState<DeleteDocumentState | null>(null);
  const [rename_document, set_rename_document] = useState<RenameDocumentState | null>(null);
  const [blank_document_pending, set_blank_document_pending] = useState(false);
  const [selected_workspace_id, set_selected_workspace_id] = useState<string | null>(
    location_state?.workspace_id ?? null,
  );

  const seen_shared_workspace_ids_ref = useRef(new Set<string>());
  const seen_shared_document_ids_ref = useRef(new Set<string>());
  const has_baseline_ref = useRef(false);

  const personal_workspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.kind === "personal"),
    [workspaces],
  );
  const all_shared_workspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.kind === "shared"),
    [workspaces],
  );
  const my_workspaces = useMemo(
    () =>
      all_shared_workspaces.filter((workspace) => !workspace.role || workspace.role === "owner"),
    [all_shared_workspaces],
  );
  const shared_workspaces = useMemo(
    () => all_shared_workspaces.filter((workspace) => workspace.role && workspace.role !== "owner"),
    [all_shared_workspaces],
  );
  const primary_personal_workspace = personal_workspaces[0] ?? null;
  const ordered_workspaces = useMemo(
    () => [...personal_workspaces, ...all_shared_workspaces],
    [personal_workspaces, all_shared_workspaces],
  );
  const selected_workspace = useMemo(
    () =>
      selected_workspace_id
        ? (ordered_workspaces.find((workspace) => workspace.id === selected_workspace_id) ?? null)
        : null,
    [ordered_workspaces, selected_workspace_id],
  );
  const create_document_mutation = useCreateDocument();
  const move_document_mutation = useMoveDocument();

  useEffect(() => {
    if (workspaces_loading || selected_workspace_id === null) {
      return;
    }

    if (!ordered_workspaces.some((workspace) => workspace.id === selected_workspace_id)) {
      set_selected_workspace_id(null);
    }
  }, [ordered_workspaces, selected_workspace_id, workspaces_loading]);

  // React to breadcrumb navigation updates while staying on /documents.
  useEffect(() => {
    if (!location_state || !("workspace_id" in location_state)) {
      return;
    }

    set_selected_workspace_id(location_state.workspace_id ?? null);
  }, [location_state?.workspace_id]);

  // If user returns to the root list, clear stale location state.
  useEffect(() => {
    if (selected_workspace_id !== null) {
      return;
    }

    if (!location_state?.workspace_id && location_state?.folder_id == null) {
      return;
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [
    location.pathname,
    location_state?.folder_id,
    location_state?.workspace_id,
    navigate,
    selected_workspace_id,
  ]);

  useEffect(() => {
    if (workspaces_loading || shared_documents_loading) {
      return;
    }

    const current_shared_workspace_ids = new Set(
      all_shared_workspaces.map((workspace) => workspace.id),
    );
    const current_shared_document_ids = new Set(shared_documents.map((document) => document.id));

    if (!has_baseline_ref.current) {
      seen_shared_workspace_ids_ref.current = current_shared_workspace_ids;
      seen_shared_document_ids_ref.current = current_shared_document_ids;
      has_baseline_ref.current = true;
      return;
    }

    const new_shared_workspace = all_shared_workspaces.find(
      (workspace) => !seen_shared_workspace_ids_ref.current.has(workspace.id),
    );
    const new_shared_document = shared_documents.find(
      (document) => !seen_shared_document_ids_ref.current.has(document.id),
    );

    if (new_shared_workspace) {
      set_toast_message(`Shared workspace added: ${new_shared_workspace.name}`);
    } else if (new_shared_document) {
      set_toast_message(`Shared document added: ${new_shared_document.title}`);
    }

    seen_shared_workspace_ids_ref.current = current_shared_workspace_ids;
    seen_shared_document_ids_ref.current = current_shared_document_ids;
  }, [all_shared_workspaces, shared_documents, shared_documents_loading, workspaces_loading]);

  useEffect(() => {
    if (!move_target) {
      return;
    }

    if (workspaces.length === 0) {
      if (move_workspace_id !== "") {
        set_move_workspace_id("");
      }
      return;
    }

    const has_selected_workspace = workspaces.some(
      (workspace) => workspace.id === move_workspace_id,
    );

    if (!has_selected_workspace) {
      set_move_workspace_id(workspaces[0]?.id ?? "");
      set_move_folder_id(null);
    }
  }, [move_target, move_workspace_id, workspaces]);

  async function handle_new_workspace() {
    try {
      const workspace = await create_workspace_mutation.mutateAsync({
        name: "New workspace",
        kind: "shared",
      });
      set_selected_workspace_id(workspace.id);
      navigate(location.pathname, {
        replace: true,
        state: {
          workspace_id: workspace.id,
          folder_id: null,
        },
      });
    } catch (error) {
      set_toast_message(get_error_message(error));
    }
  }

  function handle_select_workspace(workspace_id: string) {
    set_selected_workspace_id(workspace_id);
    navigate(location.pathname, {
      replace: true,
      state: {
        workspace_id,
        folder_id: null,
      },
    });
  }

  async function handle_blank_document() {
    if (blank_document_pending) {
      return;
    }

    set_blank_document_pending(true);

    try {
      const target_workspace =
        primary_personal_workspace ??
        (await create_workspace_mutation.mutateAsync({ name: "My Documents", kind: "personal" }));
      const document = await create_document_mutation.mutateAsync(target_workspace.id);
      navigate(`/documents/${document.id}`);
    } catch (error) {
      set_toast_message(get_error_message(error));
    } finally {
      set_blank_document_pending(false);
    }
  }

  function handle_request_move(document: DocumentResponse, trigger_element: HTMLElement | null) {
    const default_workspace = document.workspace_id;
    set_move_target({
      document,
      workspace_id: default_workspace,
      folder_id: document.folder_id ?? null,
      return_focus_to: trigger_element,
    });
    set_move_workspace_id(default_workspace);
    set_move_folder_id(document.folder_id ?? null);
  }

  function handle_select_move_workspace(workspace_id: string) {
    set_move_workspace_id(workspace_id);
    set_move_folder_id(null);
  }

  async function handle_confirm_move() {
    if (!move_target || !move_workspace_id) {
      return;
    }

    try {
      await move_document_mutation.mutateAsync({
        documentId: move_target.document.id,
        workspaceId: move_workspace_id,
        folderId: move_folder_id,
      });
      close_with_focus(set_move_target, move_target.return_focus_to, page_heading_ref);
      set_move_workspace_id("");
      set_move_folder_id(null);
    } catch (error) {
      set_toast_message(get_error_message(error));
    }
  }

  async function handle_save_workspace() {
    if (!rename_workspace) {
      return;
    }

    const next_name = rename_workspace.name.trim();

    if (!next_name) {
      set_toast_message("Workspace name is required.");
      return;
    }

    try {
      await update_workspace_mutation.mutateAsync({
        workspaceId: rename_workspace.workspace.id,
        data: { name: next_name },
      });
      close_with_focus(set_rename_workspace, rename_workspace.return_focus_to, page_heading_ref);
      set_toast_message(`Workspace updated: ${next_name}`);
    } catch (error) {
      set_toast_message(get_error_message(error));
    }
  }

  async function handle_confirm_workspace_delete() {
    if (!delete_workspace) {
      return;
    }

    try {
      await delete_workspace_mutation.mutateAsync(delete_workspace.workspace.id);
      set_toast_message(`Workspace deleted: ${delete_workspace.workspace.name}`);
      close_with_focus(set_delete_workspace, delete_workspace.return_focus_to, page_heading_ref);
    } catch (error) {
      set_toast_message(get_error_message(error));
    }
  }

  async function handle_confirm_document_delete() {
    if (!delete_document) {
      return;
    }

    try {
      await delete_document_mutation.mutateAsync(delete_document.document.id);
      set_toast_message(`Document deleted: ${delete_document.document.title || "Untitled"}`);
      close_with_focus(set_delete_document, delete_document.return_focus_to, page_heading_ref);
    } catch (error) {
      set_toast_message(get_error_message(error));
    }
  }

  async function handle_save_document() {
    if (!rename_document) {
      return;
    }

    const next_name = rename_document.name.trim();

    if (!next_name) {
      set_toast_message("Document name is required.");
      return;
    }

    try {
      await update_document_mutation.mutateAsync({
        documentId: rename_document.document.id,
        data: { title: next_name },
      });
      close_with_focus(set_rename_document, rename_document.return_focus_to, page_heading_ref);
      set_toast_message(`Document updated: ${next_name}`);
    } catch (error) {
      set_toast_message(get_error_message(error));
    }
  }

  const is_loading = workspaces_loading || shared_documents_loading;

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-app">
      <div className="mx-auto w-full max-w-[var(--max-width-document-wide)] p-6 md:p-10">
        {!selected_workspace ? (
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle pb-6">
            <div>
              <h1
                ref={page_heading_ref}
                tabIndex={-1}
                className="font-ui text-display text-text-primary"
              >
                Documents
              </h1>
              <p className="mt-1 text-ui-sm text-text-secondary">
                Organize personal workspaces, shared spaces, and direct shares.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handle_blank_document}
                isLoading={blank_document_pending}
                disabled={blank_document_pending}
              >
                <FileText className="h-4 w-4" />
                Blank document
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handle_new_workspace}
                isLoading={create_workspace_mutation.isPending}
              >
                <Plus className="h-4 w-4" />
                New workspace
              </Button>
            </div>
          </div>
        ) : null}

        {is_loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
          </div>
        ) : (
          <div className="space-y-10">
            {selected_workspace ? (
              <WorkspaceSection
                key={selected_workspace.id}
                workspace={selected_workspace}
                onBackToWorkspaces={() => {
                  set_selected_workspace_id(null);
                  navigate(location.pathname, { replace: true, state: null });
                }}
                onRequestRenameWorkspace={(workspace, trigger_element) =>
                  set_rename_workspace({
                    workspace,
                    name: workspace.name,
                    return_focus_to: trigger_element,
                  })
                }
                onRequestDeleteWorkspace={(workspace, trigger_element) =>
                  set_delete_workspace({ workspace, return_focus_to: trigger_element })
                }
                initial_folder_id={
                  location_state?.workspace_id === selected_workspace.id
                    ? (location_state?.folder_id ?? null)
                    : null
                }
                onOpenDocument={(document_id) => navigate(`/documents/${document_id}`)}
                onLocationChange={(folder_id) => {
                  // If navigation explicitly requested the workspace list (Caret click),
                  // do not push workspace/folder state back immediately.
                  if (
                    location_state &&
                    "workspace_id" in location_state &&
                    location_state.workspace_id === null
                  ) {
                    return;
                  }

                  const current_workspace_id = selected_workspace.id;
                  const current_folder_id = folder_id ?? null;
                  const state_workspace_id = location_state?.workspace_id ?? null;
                  const state_folder_id = location_state?.folder_id ?? null;

                  if (
                    state_workspace_id === current_workspace_id &&
                    state_folder_id === current_folder_id
                  ) {
                    return;
                  }

                  navigate(location.pathname, {
                    replace: true,
                    state: {
                      workspace_id: current_workspace_id,
                      folder_id: current_folder_id,
                    },
                  });
                }}
                onRequestMove={handle_request_move}
                onRequestDeleteDocument={(document, trigger_element) =>
                  set_delete_document({ document, return_focus_to: trigger_element })
                }
                onRequestRenameDocument={(document, trigger_element) =>
                  set_rename_document({
                    document,
                    name: document.title || "Untitled",
                    return_focus_to: trigger_element,
                  })
                }
                onToast={set_toast_message}
              />
            ) : ordered_workspaces.length > 0 ? (
              <div className="space-y-8">
                <WorkspaceCardGroup
                  title="Personal workspace"
                  description="Your private, non-transferable workspace."
                  workspaces={personal_workspaces}
                  on_select_workspace={handle_select_workspace}
                  on_rename_workspace={(ws, trigger) =>
                    set_rename_workspace({ workspace: ws, name: ws.name, return_focus_to: trigger })
                  }
                  on_delete_workspace={(ws, trigger) =>
                    set_delete_workspace({ workspace: ws, return_focus_to: trigger })
                  }
                />

                <WorkspaceCardGroup
                  title="My workspaces"
                  description="Shared workspaces you own and can transfer or invite people into."
                  workspaces={my_workspaces}
                  on_select_workspace={handle_select_workspace}
                  on_rename_workspace={(ws, trigger) =>
                    set_rename_workspace({ workspace: ws, name: ws.name, return_focus_to: trigger })
                  }
                  on_delete_workspace={(ws, trigger) =>
                    set_delete_workspace({ workspace: ws, return_focus_to: trigger })
                  }
                />

                {shared_workspaces.length > 0 ? (
                  <WorkspaceCardGroup
                    title="Shared workspaces"
                    description="Workspaces other people have shared with you."
                    workspaces={shared_workspaces}
                    on_select_workspace={handle_select_workspace}
                  />
                ) : null}
              </div>
            ) : (
              <EmptyWorkspaceState onCreate={handle_blank_document} />
            )}

            {!selected_workspace && shared_documents.length > 0 ? (
              <section className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-ui-sm font-medium uppercase tracking-widest text-text-secondary">
                    Directly shared documents
                  </h2>
                  <span className="text-ui-sm text-text-secondary/50">
                    Documents shared with you outside a workspace.
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {shared_documents.map((document) => (
                    <DocumentCard
                      key={document.id}
                      document={document}
                      onOpen={() => navigate(`/documents/${document.id}`)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>

      {toast_message ? (
        <NotificationToast message={toast_message} onDismiss={() => set_toast_message(null)} />
      ) : null}

      {move_target ? (
        <MoveDocumentDialog
          document_title={move_target.document.title}
          workspaces={workspaces}
          selected_workspace_id={move_workspace_id}
          selected_folder_id={move_folder_id}
          on_select_workspace={handle_select_move_workspace}
          on_select_folder={set_move_folder_id}
          on_cancel={() =>
            close_with_focus(set_move_target, move_target.return_focus_to, page_heading_ref)
          }
          on_confirm={handle_confirm_move}
          is_loading={move_document_mutation.isPending}
        />
      ) : null}

      {rename_workspace ? (
        <RenameWorkspaceDialog
          workspace_name={rename_workspace.workspace.name}
          value={rename_workspace.name}
          on_change={(name) =>
            set_rename_workspace((current_state) =>
              current_state ? { ...current_state, name } : current_state,
            )
          }
          on_cancel={() =>
            close_with_focus(
              set_rename_workspace,
              rename_workspace.return_focus_to,
              page_heading_ref,
            )
          }
          on_confirm={handle_save_workspace}
          is_loading={update_workspace_mutation.isPending}
        />
      ) : null}

      {rename_document ? (
        <RenameDocumentDialog
          document_name={rename_document.document.title || "Untitled"}
          value={rename_document.name}
          on_change={(name) =>
            set_rename_document((current_state) =>
              current_state ? { ...current_state, name } : current_state,
            )
          }
          on_cancel={() =>
            close_with_focus(set_rename_document, rename_document.return_focus_to, page_heading_ref)
          }
          on_confirm={handle_save_document}
          is_loading={update_document_mutation.isPending}
        />
      ) : null}

      {delete_workspace ? (
        <ConfirmationDialog
          title="Delete workspace"
          description={`Delete ${delete_workspace.workspace.name}? This action cannot be undone. Documents and their contents will also be deleted.`}
          confirm_label="Confirm delete workspace"
          on_cancel={() =>
            close_with_focus(
              set_delete_workspace,
              delete_workspace.return_focus_to,
              page_heading_ref,
            )
          }
          on_confirm={handle_confirm_workspace_delete}
          is_loading={delete_workspace_mutation.isPending}
        />
      ) : null}

      {delete_document ? (
        <ConfirmationDialog
          title="Delete document"
          description={`Delete ${delete_document.document.title || "Untitled"}? This action cannot be undone.`}
          confirm_label="Confirm delete document"
          on_cancel={() =>
            close_with_focus(set_delete_document, delete_document.return_focus_to, page_heading_ref)
          }
          on_confirm={handle_confirm_document_delete}
          is_loading={delete_document_mutation.isPending}
        />
      ) : null}
    </div>
  );
}

interface WorkspaceSectionProps {
  workspace: WorkspaceResponse;
  onLocationChange?: (folder_id: string | null) => void;
  onBackToWorkspaces?: () => void;
  onRequestRenameWorkspace?: (
    workspace: WorkspaceResponse,
    trigger_element: HTMLElement | null,
  ) => void;
  onRequestDeleteWorkspace?: (
    workspace: WorkspaceResponse,
    trigger_element: HTMLElement | null,
  ) => void;
  onOpenDocument: (document_id: string) => void;
  onRequestMove?: (document: DocumentResponse, trigger_element: HTMLElement | null) => void;
  onRequestRenameDocument?: (
    document: DocumentResponse,
    trigger_element: HTMLElement | null,
  ) => void;
  onRequestDeleteDocument?: (
    document: DocumentResponse,
    trigger_element: HTMLElement | null,
  ) => void;
  onToast: (message: string | null) => void;
  /** Folder to open immediately when the section mounts (e.g. when navigating back from a document). */
  initial_folder_id?: string | null;
}

interface WorkspaceCardGroupProps {
  title: string;
  description: string;
  workspaces: WorkspaceResponse[];
  on_select_workspace: (workspace_id: string) => void;
  on_rename_workspace?: (workspace: WorkspaceResponse, trigger: HTMLElement | null) => void;
  on_delete_workspace?: (workspace: WorkspaceResponse, trigger: HTMLElement | null) => void;
}

function WorkspaceCard({
  workspace,
  on_select,
  on_rename,
  on_delete,
}: {
  workspace: WorkspaceResponse;
  on_select: () => void;
  on_rename?: (trigger: HTMLElement | null) => void;
  on_delete?: (trigger: HTMLElement | null) => void;
}) {
  const is_personal = workspace.kind === "personal";
  const shared_with = workspace.shared_with ?? [];
  const shared_with_label =
    shared_with.length > 0 ? `Shared with ${shared_with.length} people` : "Not shared yet";
  const [menu_open, set_menu_open] = useState(false);
  const [shared_with_open, set_shared_with_open] = useState(false);
  const menu_ref = useRef<HTMLDivElement | null>(null);
  const shared_with_ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu_open && !shared_with_open) return;
    function handle_outside(event: MouseEvent) {
      const target = event.target as Node;
      if (menu_ref.current && !menu_ref.current.contains(target)) {
        set_menu_open(false);
      }
      if (shared_with_ref.current && !shared_with_ref.current.contains(target)) {
        set_shared_with_open(false);
      }
    }
    document.addEventListener("mousedown", handle_outside);
    return () => document.removeEventListener("mousedown", handle_outside);
  }, [menu_open, shared_with_open]);

  const has_menu = on_rename || on_delete;

  return (
    <div
      className={`group relative rounded-lg border border-border-subtle bg-surface shadow-sm transition-all duration-150 hover:shadow-elevated ${is_personal ? "border-l-[3px] border-l-accent-caret" : "border-l-[3px] border-l-accent-main"}`}
    >
      <button
        type="button"
        onClick={on_select}
        className="flex w-full items-center gap-3 px-4 pb-1 pt-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-main/40"
        aria-label={`Open workspace ${workspace.name}`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] transition-colors ${is_personal ? "bg-accent-caret/8 text-accent-caret" : "bg-accent-main/8 text-accent-main"}`}
        >
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ui-base font-medium text-text-primary">
            {workspace.name}
          </span>
        </span>
      </button>

      <div className="px-4 pb-3 text-ui-sm text-text-secondary">
        {is_personal ? (
          <span>Personal · Private</span>
        ) : shared_with.length > 0 ? (
          <div ref={shared_with_ref} className="relative inline-block">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                set_menu_open(false);
                set_shared_with_open((prev) => !prev);
              }}
              className="rounded-[4px] px-1 py-0.5 text-text-secondary transition hover:bg-app hover:text-text-primary"
              aria-expanded={shared_with_open}
              aria-label={`View people shared in ${workspace.name}`}
            >
              {shared_with_label}
            </button>

            {shared_with_open ? (
              <div className="absolute left-0 top-full z-40 mt-1 min-w-[220px] rounded-lg border border-border-subtle bg-surface p-2 shadow-elevated">
                <p className="px-1 pb-1 text-ui-xs uppercase tracking-wide text-text-secondary">
                  Shared with
                </p>
                <div className="max-h-40 overflow-y-auto">
                  {shared_with.map((email) => (
                    <p
                      key={email}
                      className="truncate rounded-[4px] px-2 py-1 text-ui-sm text-text-primary"
                    >
                      {email}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <span>Not shared yet</span>
        )}
      </div>

      {has_menu ? (
        <div ref={menu_ref} className="absolute right-2 top-1/2 -translate-y-1/2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              set_shared_with_open(false);
              set_menu_open((prev) => !prev);
            }}
            className={`rounded-[4px] p-1.5 text-text-secondary transition-opacity hover:bg-border-subtle/50 hover:text-text-primary ${menu_open ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            aria-label={`Workspace options for ${workspace.name}`}
          >
            <Ellipsis className="h-4 w-4" aria-hidden="true" />
          </button>

          {menu_open ? (
            <div className="absolute right-0 top-full z-40 mt-1 min-w-[160px] rounded-lg border border-border-subtle bg-surface py-1 shadow-elevated">
              {on_rename ? (
                <button
                  type="button"
                  onClick={(e) => {
                    set_menu_open(false);
                    on_rename(e.currentTarget);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-ui-sm text-text-primary transition hover:bg-app"
                >
                  <Pencil className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
                  Rename
                </button>
              ) : null}
              {on_delete ? (
                <button
                  type="button"
                  onClick={(e) => {
                    set_menu_open(false);
                    on_delete(e.currentTarget);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-ui-sm text-error transition hover:bg-app"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceCardGroup({
  title,
  description,
  workspaces,
  on_select_workspace,
  on_rename_workspace,
  on_delete_workspace,
}: WorkspaceCardGroupProps) {
  if (workspaces.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2" aria-label={title}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-ui-sm font-medium uppercase tracking-widest text-text-secondary">
          {title}
        </h2>
        <span className="text-ui-sm text-text-secondary/50">{description}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {workspaces.map((workspace) => (
          <WorkspaceCard
            key={workspace.id}
            workspace={workspace}
            on_select={() => on_select_workspace(workspace.id)}
            on_rename={
              on_rename_workspace ? (trigger) => on_rename_workspace(workspace, trigger) : undefined
            }
            on_delete={
              on_delete_workspace ? (trigger) => on_delete_workspace(workspace, trigger) : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

interface CreateFolderState {
  name: string;
  parent_folder_id: string | null;
  return_focus_to: HTMLElement | null;
}

interface RenameFolderState {
  folder: FolderResponse;
  name: string;
  return_focus_to: HTMLElement | null;
}

interface DeleteFolderState {
  folder: FolderResponse;
  return_focus_to: HTMLElement | null;
}

interface MoveFolderState {
  folder: FolderResponse;
  parent_folder_id: string | null;
  return_focus_to: HTMLElement | null;
}

interface ShareWorkspaceState {
  email: string;
  return_focus_to: HTMLElement | null;
}

function WorkspaceSection({
  workspace,
  onLocationChange,
  onBackToWorkspaces,
  onRequestRenameWorkspace,
  onRequestDeleteWorkspace,
  onOpenDocument,
  onRequestMove,
  onRequestRenameDocument,
  onRequestDeleteDocument,
  onToast,
  initial_folder_id = null,
}: WorkspaceSectionProps) {
  const { data: documents = [], isLoading } = useDocuments(workspace.id);
  const { data: folders = [], isLoading: folders_loading } = useFolders(workspace.id);
  const create_document_mutation = useCreateDocument();
  const create_folder_mutation = useCreateFolder();
  const update_folder_mutation = useUpdateFolder();
  const delete_folder_mutation = useDeleteFolder();
  const invite_workspace_mutation = useInviteWorkspaceCollaborator(workspace.id);
  const can_manage_workspace = can_manage_workspace_actions(workspace);
  const can_delete_documents = can_delete_documents_in_workspace(workspace);
  const can_share_workspace = workspace.kind === "shared";
  const [selected_folder_id_state, set_selected_folder_id] = useState<string | null>(
    initial_folder_id,
  );
  const [create_folder, set_create_folder] = useState<CreateFolderState | null>(null);
  const [rename_folder, set_rename_folder] = useState<RenameFolderState | null>(null);
  const [delete_folder, set_delete_folder] = useState<DeleteFolderState | null>(null);
  const [move_folder, set_move_folder] = useState<MoveFolderState | null>(null);
  const [share_workspace, set_share_workspace] = useState<ShareWorkspaceState | null>(null);
  const [is_overflow_open, set_is_overflow_open] = useState(false);
  const overflow_ref = useRef<HTMLDivElement | null>(null);
  const suppress_location_sync_ref = useRef(false);

  useEffect(() => {
    suppress_location_sync_ref.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    set_selected_folder_id(initial_folder_id ?? null);
  }, [initial_folder_id, workspace.id]);

  useEffect(() => {
    if (!is_overflow_open) return;
    function handle_outside(event: MouseEvent) {
      if (overflow_ref.current && !overflow_ref.current.contains(event.target as Node)) {
        set_is_overflow_open(false);
      }
    }
    document.addEventListener("mousedown", handle_outside);
    return () => document.removeEventListener("mousedown", handle_outside);
  }, [is_overflow_open]);

  const selected_folder_id = useMemo(() => {
    if (
      selected_folder_id_state &&
      folders.some((folder) => folder.id === selected_folder_id_state)
    ) {
      return selected_folder_id_state;
    }

    return null;
  }, [folders, selected_folder_id_state]);
  const selected_folder = useMemo(
    () => folders.find((folder) => folder.id === selected_folder_id) ?? null,
    [folders, selected_folder_id],
  );
  const visible_folders = useMemo(
    () => folders.filter((folder) => (folder.parent_folder_id ?? null) === selected_folder_id),
    [folders, selected_folder_id],
  );
  const visible_documents = useMemo(
    () => documents.filter((document) => (document.folder_id ?? null) === selected_folder_id),
    [documents, selected_folder_id],
  );
  const move_folder_blocked_ids = useMemo(
    () => (move_folder ? get_folder_subtree_ids(folders, move_folder.folder.id) : []),
    [folders, move_folder],
  );

  useEffect(() => {
    if (suppress_location_sync_ref.current) {
      suppress_location_sync_ref.current = false;
      return;
    }
    onLocationChange?.(selected_folder_id);
  }, [onLocationChange, selected_folder_id]);
  async function handle_create_document() {
    try {
      const document = await create_document_mutation.mutateAsync({
        workspaceId: workspace.id,
        folderId: selected_folder_id ?? undefined,
      });
      onOpenDocument(document.id);
    } catch (error) {
      onToast(get_error_message(error));
    }
  }

  async function handle_confirm_create_folder() {
    if (!create_folder) {
      return;
    }

    const next_name = create_folder.name.trim();

    if (!next_name) {
      onToast("Folder name is required.");
      return;
    }

    try {
      await create_folder_mutation.mutateAsync({
        workspaceId: workspace.id,
        name: next_name,
        parentFolderId: create_folder.parent_folder_id,
      });
      close_with_focus(set_create_folder, create_folder.return_focus_to, undefined);
      onToast(`Folder created: ${next_name}`);
    } catch (error) {
      onToast(get_error_message(error));
    }
  }

  async function handle_save_folder() {
    if (!rename_folder) {
      return;
    }

    const next_name = rename_folder.name.trim();

    if (!next_name) {
      onToast("Folder name is required.");
      return;
    }

    try {
      await update_folder_mutation.mutateAsync({
        folderId: rename_folder.folder.id,
        data: { name: next_name },
      });
      close_with_focus(set_rename_folder, rename_folder.return_focus_to, undefined);
      onToast(`Folder updated: ${next_name}`);
    } catch (error) {
      onToast(get_error_message(error));
    }
  }

  async function handle_confirm_folder_delete() {
    if (!delete_folder) {
      return;
    }

    try {
      const deleted_folder_subtree_ids = get_folder_subtree_ids(folders, delete_folder.folder.id);

      await delete_folder_mutation.mutateAsync({
        folderId: delete_folder.folder.id,
        workspaceId: workspace.id,
        documentIds: documents
          .filter((document) =>
            document.folder_id ? deleted_folder_subtree_ids.includes(document.folder_id) : false,
          )
          .map((document) => document.id),
      });
      if (selected_folder_id === delete_folder.folder.id) {
        set_selected_folder_id(null);
      }
      onToast(`Folder deleted: ${delete_folder.folder.name}`);
      close_with_focus(set_delete_folder, delete_folder.return_focus_to, undefined);
    } catch (error) {
      onToast(get_error_message(error));
    }
  }

  async function handle_confirm_folder_move() {
    if (!move_folder) {
      return;
    }

    try {
      await update_folder_mutation.mutateAsync({
        folderId: move_folder.folder.id,
        data: { parentFolderId: move_folder.parent_folder_id },
      });
      if (selected_folder_id === move_folder.folder.id) {
        set_selected_folder_id(move_folder.parent_folder_id);
      }
      onToast(`Folder moved: ${move_folder.folder.name}`);
      close_with_focus(set_move_folder, move_folder.return_focus_to, undefined);
    } catch (error) {
      onToast(get_error_message(error));
    }
  }

  async function handle_share_workspace() {
    if (!share_workspace) {
      return;
    }

    const normalized_email = share_workspace.email.trim().toLowerCase();
    if (!normalized_email) {
      onToast("Email is required.");
      return;
    }

    try {
      await invite_workspace_mutation.mutateAsync({ email: normalized_email });
      onToast(`Invitation sent to ${normalized_email}.`);
      close_with_focus(set_share_workspace, share_workspace.return_focus_to, undefined);
    } catch (error) {
      onToast(get_error_message(error));
    }
  }

  const workspace_is_personal = workspace.kind === "personal";
  const workspace_kind_label = workspace_is_personal
    ? "Personal workspace"
    : can_manage_workspace
      ? "My workspace"
      : "Shared workspace";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {onBackToWorkspaces ? (
              <button
                type="button"
                onClick={onBackToWorkspaces}
                className="rounded-[4px] p-1.5 text-text-secondary transition hover:bg-border-subtle/50 hover:text-text-primary"
                aria-label="Caret"
                title="Back to workspace list"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            <div
              className={`h-4 w-[3px] rounded-full ${workspace_is_personal ? "bg-accent-caret" : "bg-accent-main"}`}
              aria-hidden="true"
            />
            <h2 className="text-ui-lg font-medium text-text-primary">{workspace.name}</h2>
            <span className="text-ui-sm text-text-secondary">{workspace_kind_label}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {can_manage_workspace ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) =>
                set_create_folder({
                  name: "",
                  parent_folder_id: selected_folder_id,
                  return_focus_to: event.currentTarget as HTMLElement,
                })
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New folder
            </Button>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            onClick={handle_create_document}
            isLoading={create_document_mutation.isPending}
          >
            <FileText className="h-4 w-4" />
            New document
          </Button>

          {can_share_workspace ? (
            <button
              type="button"
              onClick={(event) =>
                set_share_workspace({
                  email: "",
                  return_focus_to: event.currentTarget as HTMLElement,
                })
              }
              className="rounded-[4px] p-2 text-text-secondary transition hover:bg-border-subtle/50 hover:text-text-primary"
              aria-label={`Share workspace ${workspace.name}`}
              title="Invite collaborator"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          {can_manage_workspace && onRequestRenameWorkspace ? (
            <button
              type="button"
              onClick={(event) =>
                onRequestRenameWorkspace(workspace, event.currentTarget as HTMLElement)
              }
              className="rounded-[4px] p-2 text-text-secondary transition hover:bg-border-subtle/50 hover:text-text-primary"
              aria-label={`Rename workspace ${workspace.name}`}
              title="Rename workspace"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          {can_manage_workspace && onRequestDeleteWorkspace ? (
            <button
              type="button"
              onClick={(event) =>
                onRequestDeleteWorkspace(workspace, event.currentTarget as HTMLElement)
              }
              className="rounded-[4px] p-2 text-text-secondary transition hover:bg-border-subtle/50 hover:text-text-primary"
              aria-label={`Delete workspace ${workspace.name}`}
              title="Delete workspace"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {folders_loading || isLoading ? (
        <div className="flex items-center gap-2 text-ui-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading
        </div>
      ) : visible_folders.length === 0 && visible_documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-subtle py-12 text-center">
          <FileText className="mb-3 h-8 w-8 text-text-secondary/40" aria-hidden="true" />
          <p className="text-ui-base font-medium text-text-primary">Empty folder</p>
          <p className="mt-1 text-ui-sm text-text-secondary">
            Create a document or folder to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible_folders.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visible_folders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  onOpen={() => set_selected_folder_id(folder.id)}
                  onRequestMove={
                    can_manage_workspace
                      ? (trigger) =>
                          set_move_folder({
                            folder,
                            parent_folder_id: folder.parent_folder_id ?? null,
                            return_focus_to: trigger,
                          })
                      : undefined
                  }
                  onRequestRename={
                    can_manage_workspace
                      ? (trigger) =>
                          set_rename_folder({ folder, name: folder.name, return_focus_to: trigger })
                      : undefined
                  }
                  onRequestDelete={
                    can_manage_workspace
                      ? (trigger) => set_delete_folder({ folder, return_focus_to: trigger })
                      : undefined
                  }
                />
              ))}
            </div>
          ) : null}
          {visible_documents.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible_documents.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  onOpen={() => onOpenDocument(document.id)}
                  onRequestMove={can_delete_documents ? onRequestMove : undefined}
                  onRequestDelete={
                    can_delete_documents && onRequestDeleteDocument
                      ? (trigger_element) => onRequestDeleteDocument(document, trigger_element)
                      : undefined
                  }
                  onRequestRename={
                    onRequestRenameDocument
                      ? (trigger_element) => onRequestRenameDocument(document, trigger_element)
                      : undefined
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      )}

      {create_folder ? (
        <FolderDialog
          title="Create folder"
          description={
            create_folder.parent_folder_id
              ? `Create a subfolder inside ${selected_folder?.name ?? "this folder"}.`
              : `Create a folder in ${workspace.name}.`
          }
          value={create_folder.name}
          confirm_label="Create folder"
          on_change={(name) =>
            set_create_folder((current_state) =>
              current_state ? { ...current_state, name } : current_state,
            )
          }
          on_cancel={() =>
            close_with_focus(set_create_folder, create_folder.return_focus_to, undefined)
          }
          on_confirm={handle_confirm_create_folder}
          is_loading={create_folder_mutation.isPending}
        />
      ) : null}

      {rename_folder ? (
        <FolderDialog
          title="Rename folder"
          description={`Update the name for ${rename_folder.folder.name}.`}
          value={rename_folder.name}
          confirm_label="Save folder"
          on_change={(name) =>
            set_rename_folder((current_state) =>
              current_state ? { ...current_state, name } : current_state,
            )
          }
          on_cancel={() =>
            close_with_focus(set_rename_folder, rename_folder.return_focus_to, undefined)
          }
          on_confirm={handle_save_folder}
          is_loading={update_folder_mutation.isPending}
        />
      ) : null}

      {delete_folder ? (
        <ConfirmationDialog
          title="Delete folder"
          description={`Delete ${delete_folder.folder.name}? This action cannot be undone. Documents inside this folder will also be deleted.`}
          confirm_label="Confirm delete folder"
          on_cancel={() =>
            close_with_focus(set_delete_folder, delete_folder.return_focus_to, undefined)
          }
          on_confirm={handle_confirm_folder_delete}
          is_loading={delete_folder_mutation.isPending}
        />
      ) : null}

      {move_folder ? (
        <MoveFolderDialog
          folder_name={move_folder.folder.name}
          folders={folders}
          selected_parent_folder_id={move_folder.parent_folder_id}
          blocked_folder_ids={move_folder_blocked_ids}
          on_select_parent_folder={(folder_id) =>
            set_move_folder((current_state) =>
              current_state ? { ...current_state, parent_folder_id: folder_id } : current_state,
            )
          }
          on_cancel={() =>
            close_with_focus(set_move_folder, move_folder.return_focus_to, undefined)
          }
          on_confirm={handle_confirm_folder_move}
          is_loading={update_folder_mutation.isPending}
        />
      ) : null}

      {share_workspace ? (
        <WorkspaceShareDialog
          workspace_name={workspace.name}
          value={share_workspace.email}
          on_change={(email) =>
            set_share_workspace((current_state) =>
              current_state ? { ...current_state, email } : current_state,
            )
          }
          on_cancel={() =>
            close_with_focus(set_share_workspace, share_workspace.return_focus_to, undefined)
          }
          on_confirm={handle_share_workspace}
          is_loading={invite_workspace_mutation.isPending}
        />
      ) : null}
    </section>
  );
}

interface FolderDialogProps {
  title: string;
  description: string;
  value: string;
  confirm_label: string;
  on_change: (value: string) => void;
  on_cancel: () => void;
  on_confirm: () => void;
  is_loading: boolean;
}

function FolderDialog({
  title,
  description,
  value,
  confirm_label,
  on_change,
  on_cancel,
  on_confirm,
  is_loading,
}: FolderDialogProps) {
  const initial_focus_ref = useRef<HTMLInputElement | null>(null);

  return (
    <ModalDialog
      title={title}
      description={description}
      on_close={on_cancel}
      initial_focus_ref={initial_focus_ref}
    >
      <label className="mt-4 block text-ui-sm text-text-primary" htmlFor="folder-name-input">
        Folder name
      </label>
      <input
        id="folder-name-input"
        ref={initial_focus_ref}
        value={value}
        onChange={(event) => on_change(event.target.value)}
        className="mt-2 w-full rounded-[4px] border border-border-subtle bg-surface px-3 py-2 text-ui-sm text-text-primary outline-none ring-0"
      />

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={on_cancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={on_confirm} isLoading={is_loading}>
          {confirm_label}
        </Button>
      </div>
    </ModalDialog>
  );
}

interface DocumentCardProps {
  document: DocumentResponse;
  onOpen: () => void;
  onRequestMove?: (document: DocumentResponse, trigger_element: HTMLElement | null) => void;
  onRequestRename?: (trigger_element: HTMLElement | null) => void;
  onRequestDelete?: (trigger_element: HTMLElement | null) => void;
}

interface FolderCardProps {
  folder: FolderResponse;
  onOpen: () => void;
  onRequestMove?: (trigger: HTMLElement | null) => void;
  onRequestRename?: (trigger: HTMLElement | null) => void;
  onRequestDelete?: (trigger: HTMLElement | null) => void;
}

function FolderCard({
  folder,
  onOpen,
  onRequestMove,
  onRequestRename,
  onRequestDelete,
}: FolderCardProps) {
  const has_actions = onRequestMove || onRequestRename || onRequestDelete;
  return (
    <div className="group relative flex items-center gap-3 rounded-lg border border-border-subtle bg-surface shadow-sm transition-all duration-150 hover:border-accent-main/30 hover:shadow-elevated">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-main/40"
        aria-label={`Open ${folder.name} folder`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] bg-app text-text-secondary transition-colors group-hover:bg-accent-main/10 group-hover:text-accent-main">
          <Folder className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <p className="truncate text-ui-base font-medium text-text-primary">{folder.name}</p>
          <p className="mt-0.5 text-ui-sm text-text-secondary">Folder</p>
        </span>
      </button>

      {has_actions ? (
        <div className="absolute right-2 flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {onRequestMove ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestMove(e.currentTarget);
              }}
              className="rounded-[4px] p-1.5 text-text-secondary transition hover:bg-app hover:text-text-primary"
              aria-label={`Move folder ${folder.name}`}
              title="Move folder"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
          {onRequestRename ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestRename(e.currentTarget);
              }}
              className="rounded-[4px] p-1.5 text-text-secondary transition hover:bg-app hover:text-text-primary"
              aria-label={`Rename folder ${folder.name}`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
          {onRequestDelete ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete(e.currentTarget);
              }}
              className="rounded-[4px] p-1.5 text-text-secondary transition hover:bg-app hover:text-text-primary"
              aria-label={`Delete folder ${folder.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DocumentCard({
  document,
  onOpen,
  onRequestMove,
  onRequestRename,
  onRequestDelete,
}: DocumentCardProps) {
  const has_actions = onRequestMove || onRequestRename || onRequestDelete;
  return (
    <article className="group relative flex flex-col rounded-lg border border-border-subtle bg-surface shadow-sm transition-all duration-150 hover:border-accent-main/30 hover:shadow-elevated">
      {has_actions ? (
        <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {onRequestMove ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRequestMove(document, event.currentTarget as HTMLElement);
              }}
              className="rounded-[4px] bg-surface p-1.5 text-text-secondary shadow-sm transition hover:bg-app hover:text-text-primary"
              aria-label={`Move document ${document.title || "Untitled"}`}
              title="Move document"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
          {onRequestRename ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRequestRename(event.currentTarget as HTMLElement);
              }}
              className="rounded-[4px] bg-surface p-1.5 text-text-secondary shadow-sm transition hover:bg-app hover:text-text-primary"
              aria-label={`Rename ${document.title || "Untitled"}`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
          {onRequestDelete ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRequestDelete(event.currentTarget as HTMLElement);
              }}
              className="rounded-[4px] bg-surface p-1.5 text-text-secondary shadow-sm transition hover:bg-app hover:text-text-primary"
              aria-label={`Delete ${document.title || "Untitled"}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-main/40 focus-visible:ring-inset"
        aria-label={`Open ${document.title || "Untitled"}`}
      >
        <div className="mb-4 space-y-2 pt-1">
          <div className="h-1.5 w-4/5 rounded-full bg-border-subtle" />
          <div className="h-1.5 w-full rounded-full bg-border-subtle/70" />
          <div className="h-1.5 w-11/12 rounded-full bg-border-subtle/70" />
          <div className="h-1.5 w-full rounded-full bg-border-subtle/50" />
          <div className="h-1.5 w-3/4 rounded-full bg-border-subtle/50" />
          <div className="h-1.5 w-5/6 rounded-full bg-border-subtle/30" />
        </div>

        <div className="mt-auto border-t border-border-subtle pt-3">
          <p className="truncate text-ui-base font-medium text-text-primary">
            {document.title || "Untitled"}
          </p>
          <p className="mt-0.5 text-ui-sm text-text-secondary">
            Updated{" "}
            {new Date(document.updated_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      </button>
    </article>
  );
}

interface RenameWorkspaceDialogProps {
  workspace_name: string;
  value: string;
  on_change: (value: string) => void;
  on_cancel: () => void;
  on_confirm: () => void;
  is_loading: boolean;
}

function RenameWorkspaceDialog({
  workspace_name,
  value,
  on_change,
  on_cancel,
  on_confirm,
  is_loading,
}: RenameWorkspaceDialogProps) {
  const initial_focus_ref = useRef<HTMLInputElement | null>(null);

  return (
    <ModalDialog
      title="Rename workspace"
      description={`Update the name for ${workspace_name}.`}
      on_close={on_cancel}
      initial_focus_ref={initial_focus_ref}
    >
      <label className="mt-4 block text-ui-sm text-text-primary" htmlFor="workspace-name-input">
        Workspace name
      </label>
      <input
        id="workspace-name-input"
        ref={initial_focus_ref}
        value={value}
        onChange={(event) => on_change(event.target.value)}
        className="mt-2 w-full rounded-[4px] border border-border-subtle bg-surface px-3 py-2 text-ui-sm text-text-primary outline-none ring-0"
      />

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={on_cancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={on_confirm} isLoading={is_loading}>
          Save workspace
        </Button>
      </div>
    </ModalDialog>
  );
}

interface RenameDocumentDialogProps {
  document_name: string;
  value: string;
  on_change: (value: string) => void;
  on_cancel: () => void;
  on_confirm: () => void;
  is_loading: boolean;
}

function RenameDocumentDialog({
  document_name,
  value,
  on_change,
  on_cancel,
  on_confirm,
  is_loading,
}: RenameDocumentDialogProps) {
  const initial_focus_ref = useRef<HTMLInputElement | null>(null);

  return (
    <ModalDialog
      title="Rename document"
      description={`Update the name for ${document_name}.`}
      on_close={on_cancel}
      initial_focus_ref={initial_focus_ref}
    >
      <label className="mt-4 block text-ui-sm text-text-primary" htmlFor="document-name-input">
        Document name
      </label>
      <input
        id="document-name-input"
        ref={initial_focus_ref}
        value={value}
        onChange={(event) => on_change(event.target.value)}
        className="mt-2 w-full rounded-[4px] border border-border-subtle bg-surface px-3 py-2 text-ui-sm text-text-primary outline-none ring-0"
      />

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={on_cancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={on_confirm} isLoading={is_loading}>
          Save document
        </Button>
      </div>
    </ModalDialog>
  );
}

interface EmptyWorkspaceStateProps {
  onCreate: () => void;
}

function EmptyWorkspaceState({ onCreate }: EmptyWorkspaceStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-subtle py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent-caret/8">
        <FileText className="h-6 w-6 text-accent-caret" aria-hidden="true" />
      </div>
      <p className="text-ui-base font-medium text-text-primary">Start writing</p>
      <p className="mt-1 text-ui-sm text-text-secondary">
        Create your first document — your personal workspace will be set up automatically.
      </p>
      <div className="mt-5">
        <Button variant="primary" size="sm" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Blank document
        </Button>
      </div>
    </div>
  );
}

interface MoveDocumentDialogProps {
  document_title: string;
  workspaces: WorkspaceResponse[];
  selected_workspace_id: string;
  selected_folder_id: string | null;
  on_select_workspace: (workspace_id: string) => void;
  on_select_folder: (folder_id: string | null) => void;
  on_cancel: () => void;
  on_confirm: () => void;
  is_loading: boolean;
}

function MoveDocumentDialog({
  document_title,
  workspaces,
  selected_workspace_id,
  selected_folder_id,
  on_select_workspace,
  on_select_folder,
  on_cancel,
  on_confirm,
  is_loading,
}: MoveDocumentDialogProps) {
  const initial_focus_ref = useRef<HTMLElement | null>(null);
  const { data: folders = [] } = useFolders(selected_workspace_id || undefined);
  const [expanded_folder_ids, set_expanded_folder_ids] = useState<Set<string>>(new Set());

  const folder_options = useMemo(() => {
    type FolderOption = {
      id: string;
      name: string;
      depth: number;
      parent_folder_id: string | null;
      has_children: boolean;
    };

    const by_parent = new Map<string | null, FolderResponse[]>();
    for (const folder of folders) {
      const parent = folder.parent_folder_id ?? null;
      const siblings = by_parent.get(parent) ?? [];
      siblings.push(folder);
      by_parent.set(parent, siblings);
    }

    for (const siblings of by_parent.values()) {
      siblings.sort((a, b) => a.name.localeCompare(b.name));
    }

    const visited = new Set<string>();
    const options: FolderOption[] = [];

    function walk(parent_id: string | null, depth: number, trail: string[]) {
      const children = by_parent.get(parent_id) ?? [];
      for (const folder of children) {
        if (visited.has(folder.id)) {
          continue;
        }
        visited.add(folder.id);

        options.push({
          id: folder.id,
          name: folder.name,
          depth,
          parent_folder_id: folder.parent_folder_id ?? null,
          has_children: (by_parent.get(folder.id) ?? []).length > 0,
        });

        walk(folder.id, depth + 1, [...trail, folder.name]);
      }
    }

    walk(null, 0, []);

    // Folders with broken/missing parent references are appended so they are still selectable.
    for (const folder of folders) {
      if (visited.has(folder.id)) {
        continue;
      }
      options.push({
        id: folder.id,
        name: folder.name,
        depth: 0,
        parent_folder_id: folder.parent_folder_id ?? null,
        has_children: (by_parent.get(folder.id) ?? []).length > 0,
      });
    }

    return options;
  }, [folders]);

  useEffect(() => {
    if (selected_folder_id === null) {
      return;
    }

    if (!folders.some((folder) => folder.id === selected_folder_id)) {
      on_select_folder(null);
    }
  }, [folders, on_select_folder, selected_folder_id]);

  useEffect(() => {
    const by_id = new Map(folders.map((folder) => [folder.id, folder]));
    const next_expanded = new Set<string>();

    // Expand all root folders by default for discoverability.
    for (const folder of folders) {
      if (!folder.parent_folder_id) {
        next_expanded.add(folder.id);
      }
    }

    // Always expand the full chain to the selected folder.
    let current = selected_folder_id;
    while (current) {
      const folder = by_id.get(current);
      if (!folder) {
        break;
      }
      next_expanded.add(folder.id);
      current = folder.parent_folder_id;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    set_expanded_folder_ids(next_expanded);
  }, [folders, selected_folder_id, selected_workspace_id]);

  const visible_folder_options = useMemo(() => {
    const visible: typeof folder_options = [];
    for (const option of folder_options) {
      if (!option.parent_folder_id) {
        visible.push(option);
        continue;
      }

      let parent_id: string | null = option.parent_folder_id;
      let is_visible = true;
      while (parent_id) {
        if (!expanded_folder_ids.has(parent_id)) {
          is_visible = false;
          break;
        }
        const parent_option = folder_options.find((candidate) => candidate.id === parent_id);
        parent_id = parent_option?.parent_folder_id ?? null;
      }

      if (is_visible) {
        visible.push(option);
      }
    }

    return visible;
  }, [expanded_folder_ids, folder_options]);

  return (
    <ModalDialog
      title="Move document"
      description={`Choose a workspace and folder for ${document_title || "this document"}.`}
      on_close={on_cancel}
      initial_focus_ref={initial_focus_ref}
    >
      <div className="mt-4 space-y-2">
        {workspaces.length > 0 ? (
          <>
            <label
              className="text-ui-sm font-medium text-text-primary"
              htmlFor="move-workspace-select"
            >
              Destination workspace
            </label>
            <select
              id="move-workspace-select"
              ref={(node) => {
                if (node && !selected_workspace_id) {
                  initial_focus_ref.current = node;
                }
              }}
              className="w-full rounded-[4px] border border-border-subtle bg-surface px-3 py-2 text-ui-sm text-text-primary outline-none"
              value={selected_workspace_id || workspaces[0]?.id || ""}
              onChange={(event) => on_select_workspace(event.target.value)}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="text-ui-sm text-text-secondary">Create a workspace first.</p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-ui-sm font-medium text-text-primary">Destination folder</p>
        <div className="overflow-hidden rounded-[4px] border border-border-subtle">
          <button
            type="button"
            onClick={() => on_select_folder(null)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-ui-sm transition ${
              selected_folder_id === null
                ? "bg-accent-main/10 text-text-primary"
                : "text-text-primary hover:bg-app"
            }`}
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-subtle">
              {selected_folder_id === null ? (
                <span className="h-2 w-2 rounded-full bg-accent-main" aria-hidden="true" />
              ) : null}
            </span>
            <span>Workspace root</span>
          </button>

          {visible_folder_options.map((folder) => (
            <div key={folder.id} className="border-t border-border-subtle">
              <div
                className="flex items-center gap-1.5 px-2 py-1"
                style={{ paddingLeft: `${8 + folder.depth * 20}px` }}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!folder.has_children) {
                      return;
                    }
                    set_expanded_folder_ids((previous) => {
                      const next = new Set(previous);
                      if (next.has(folder.id)) {
                        next.delete(folder.id);
                      } else {
                        next.add(folder.id);
                      }
                      return next;
                    });
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] text-text-secondary hover:bg-app"
                  aria-label={folder.has_children ? `Toggle ${folder.name}` : undefined}
                >
                  {folder.has_children ? (
                    expanded_folder_ids.has(folder.id) ? (
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    )
                  ) : (
                    <span className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => on_select_folder(folder.id)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-ui-sm transition ${
                    selected_folder_id === folder.id
                      ? "bg-accent-main/10 text-text-primary"
                      : "text-text-primary hover:bg-app"
                  }`}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-subtle">
                    {selected_folder_id === folder.id ? (
                      <span className="h-2 w-2 rounded-full bg-accent-main" aria-hidden="true" />
                    ) : null}
                  </span>
                  <Folder className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                  <span className="truncate">{folder.name}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={on_cancel}
          ref={(node) => {
            if (node && workspaces.length === 0) {
              initial_focus_ref.current = node;
            }
          }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={on_confirm}
          isLoading={is_loading}
          disabled={!selected_workspace_id || workspaces.length === 0}
        >
          Move document
        </Button>
      </div>
    </ModalDialog>
  );
}

interface MoveFolderDialogProps {
  folder_name: string;
  folders: FolderResponse[];
  selected_parent_folder_id: string | null;
  blocked_folder_ids: string[];
  on_select_parent_folder: (folder_id: string | null) => void;
  on_cancel: () => void;
  on_confirm: () => void;
  is_loading: boolean;
}

function MoveFolderDialog({
  folder_name,
  folders,
  selected_parent_folder_id,
  blocked_folder_ids,
  on_select_parent_folder,
  on_cancel,
  on_confirm,
  is_loading,
}: MoveFolderDialogProps) {
  const initial_focus_ref = useRef<HTMLElement | null>(null);
  const [expanded_folder_ids, set_expanded_folder_ids] = useState<Set<string>>(new Set());

  const available_folders = useMemo(
    () => folders.filter((folder) => !blocked_folder_ids.includes(folder.id)),
    [blocked_folder_ids, folders],
  );

  const folder_options = useMemo(() => {
    type FolderOption = {
      id: string;
      name: string;
      depth: number;
      parent_folder_id: string | null;
      has_children: boolean;
    };

    const by_parent = new Map<string | null, FolderResponse[]>();
    for (const folder of available_folders) {
      const parent = folder.parent_folder_id ?? null;
      const siblings = by_parent.get(parent) ?? [];
      siblings.push(folder);
      by_parent.set(parent, siblings);
    }

    for (const siblings of by_parent.values()) {
      siblings.sort((a, b) => a.name.localeCompare(b.name));
    }

    const visited = new Set<string>();
    const options: FolderOption[] = [];

    function walk(parent_id: string | null, depth: number) {
      const children = by_parent.get(parent_id) ?? [];
      for (const folder of children) {
        if (visited.has(folder.id)) {
          continue;
        }
        visited.add(folder.id);

        options.push({
          id: folder.id,
          name: folder.name,
          depth,
          parent_folder_id: folder.parent_folder_id ?? null,
          has_children: (by_parent.get(folder.id) ?? []).length > 0,
        });

        walk(folder.id, depth + 1);
      }
    }

    walk(null, 0);

    return options;
  }, [available_folders]);

  useEffect(() => {
    if (selected_parent_folder_id === null) {
      return;
    }

    if (!available_folders.some((folder) => folder.id === selected_parent_folder_id)) {
      on_select_parent_folder(null);
    }
  }, [available_folders, on_select_parent_folder, selected_parent_folder_id]);

  useEffect(() => {
    const by_id = new Map(available_folders.map((folder) => [folder.id, folder]));
    const next_expanded = new Set<string>();

    for (const folder of available_folders) {
      if (!folder.parent_folder_id) {
        next_expanded.add(folder.id);
      }
    }

    let current = selected_parent_folder_id;
    while (current) {
      const folder = by_id.get(current);
      if (!folder) {
        break;
      }
      next_expanded.add(folder.id);
      current = folder.parent_folder_id;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    set_expanded_folder_ids(next_expanded);
  }, [available_folders, selected_parent_folder_id]);

  const visible_folder_options = useMemo(() => {
    const visible: typeof folder_options = [];
    for (const option of folder_options) {
      if (!option.parent_folder_id) {
        visible.push(option);
        continue;
      }

      let parent_id: string | null = option.parent_folder_id;
      let is_visible = true;
      while (parent_id) {
        if (!expanded_folder_ids.has(parent_id)) {
          is_visible = false;
          break;
        }
        const parent_option = folder_options.find((candidate) => candidate.id === parent_id);
        parent_id = parent_option?.parent_folder_id ?? null;
      }

      if (is_visible) {
        visible.push(option);
      }
    }

    return visible;
  }, [expanded_folder_ids, folder_options]);

  return (
    <ModalDialog
      title="Move folder"
      description={`Choose a destination parent folder for ${folder_name}.`}
      on_close={on_cancel}
      initial_focus_ref={initial_focus_ref}
    >
      <div className="mt-4 space-y-2">
        <p className="text-ui-sm font-medium text-text-primary">Destination folder</p>
        <div className="overflow-hidden rounded-[4px] border border-border-subtle">
          <button
            type="button"
            onClick={() => on_select_parent_folder(null)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-ui-sm transition ${
              selected_parent_folder_id === null
                ? "bg-accent-main/10 text-text-primary"
                : "text-text-primary hover:bg-app"
            }`}
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-subtle">
              {selected_parent_folder_id === null ? (
                <span className="h-2 w-2 rounded-full bg-accent-main" aria-hidden="true" />
              ) : null}
            </span>
            <span>Workspace root</span>
          </button>

          {visible_folder_options.map((folder) => (
            <div key={folder.id} className="border-t border-border-subtle">
              <div
                className="flex items-center gap-1.5 px-2 py-1"
                style={{ paddingLeft: `${8 + folder.depth * 20}px` }}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!folder.has_children) {
                      return;
                    }
                    set_expanded_folder_ids((previous) => {
                      const next = new Set(previous);
                      if (next.has(folder.id)) {
                        next.delete(folder.id);
                      } else {
                        next.add(folder.id);
                      }
                      return next;
                    });
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] text-text-secondary hover:bg-app"
                  aria-label={folder.has_children ? `Toggle ${folder.name}` : undefined}
                >
                  {folder.has_children ? (
                    expanded_folder_ids.has(folder.id) ? (
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    )
                  ) : (
                    <span className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => on_select_parent_folder(folder.id)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-ui-sm transition ${
                    selected_parent_folder_id === folder.id
                      ? "bg-accent-main/10 text-text-primary"
                      : "text-text-primary hover:bg-app"
                  }`}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-subtle">
                    {selected_parent_folder_id === folder.id ? (
                      <span className="h-2 w-2 rounded-full bg-accent-main" aria-hidden="true" />
                    ) : null}
                  </span>
                  <Folder className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                  <span className="truncate">{folder.name}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={on_cancel}
          ref={(node) => {
            if (node) {
              initial_focus_ref.current = node;
            }
          }}
        >
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={on_confirm} isLoading={is_loading}>
          Move folder
        </Button>
      </div>
    </ModalDialog>
  );
}

interface WorkspaceShareDialogProps {
  workspace_name: string;
  value: string;
  on_change: (value: string) => void;
  on_cancel: () => void;
  on_confirm: () => void;
  is_loading: boolean;
}

function WorkspaceShareDialog({
  workspace_name,
  value,
  on_change,
  on_cancel,
  on_confirm,
  is_loading,
}: WorkspaceShareDialogProps) {
  const initial_focus_ref = useRef<HTMLInputElement | null>(null);

  return (
    <ModalDialog
      title="Share workspace"
      description={`Invite someone to collaborate in ${workspace_name}.`}
      on_close={on_cancel}
      initial_focus_ref={initial_focus_ref}
    >
      <label className="mt-4 block text-ui-sm text-text-primary" htmlFor="workspace-share-email">
        Email
      </label>
      <input
        id="workspace-share-email"
        ref={initial_focus_ref}
        type="email"
        value={value}
        onChange={(event) => on_change(event.target.value)}
        className="mt-2 w-full rounded-[4px] border border-border-subtle bg-surface px-3 py-2 text-ui-sm text-text-primary outline-none ring-0"
      />

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={on_cancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={on_confirm} isLoading={is_loading}>
          Send invite
        </Button>
      </div>
    </ModalDialog>
  );
}

interface ConfirmationDialogProps {
  title: string;
  description: string;
  confirm_label: string;
  on_cancel: () => void;
  on_confirm: () => void;
  is_loading: boolean;
}

function ConfirmationDialog({
  title,
  description,
  confirm_label,
  on_cancel,
  on_confirm,
  is_loading,
}: ConfirmationDialogProps) {
  const initial_focus_ref = useRef<HTMLButtonElement | null>(null);

  return (
    <ModalDialog
      title={title}
      description={description}
      on_close={on_cancel}
      initial_focus_ref={initial_focus_ref}
    >
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={on_cancel} ref={initial_focus_ref}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={on_confirm} isLoading={is_loading}>
          {confirm_label}
        </Button>
      </div>
    </ModalDialog>
  );
}

interface ModalDialogProps {
  title: string;
  description: string;
  on_close: () => void;
  initial_focus_ref?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

function ModalDialog({
  title,
  description,
  on_close,
  initial_focus_ref,
  children,
}: ModalDialogProps) {
  const title_id = useId();
  const description_id = useId();
  const dialog_ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    initial_focus_ref?.current?.focus();
  }, [initial_focus_ref]);

  function handle_key_down(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      on_close();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable_elements = dialog_ref.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    if (!focusable_elements || focusable_elements.length === 0) {
      return;
    }

    const first_element = focusable_elements[0];
    const last_element = focusable_elements[focusable_elements.length - 1];

    if (event.shiftKey && document.activeElement === first_element) {
      event.preventDefault();
      last_element.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last_element) {
      event.preventDefault();
      first_element.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialog_ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title_id}
        aria-describedby={description_id}
        onKeyDown={handle_key_down}
        className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-5 shadow-elevated"
      >
        <h2 id={title_id} className="text-ui-lg font-semibold text-text-primary">
          {title}
        </h2>
        <p id={description_id} className="mt-1 text-ui-sm text-text-secondary">
          {description}
        </p>
        {children}
      </div>
    </div>
  );
}

function can_manage_workspace_actions(workspace: WorkspaceResponse) {
  if (workspace.kind === "personal") {
    return true;
  }

  return workspace.role === "owner";
}

function can_delete_documents_in_workspace(workspace: WorkspaceResponse) {
  if (workspace.kind === "personal") {
    return true;
  }

  return workspace.role === "owner";
}

function close_with_focus<T>(
  setter: Dispatch<SetStateAction<T | null>>,
  return_focus_to: HTMLElement | null,
  fallback_focus_to?: RefObject<HTMLElement | null>,
) {
  setter(null);

  setTimeout(() => {
    if (return_focus_to && return_focus_to.isConnected) {
      return_focus_to.focus();
      return;
    }

    if (fallback_focus_to?.current?.isConnected) {
      fallback_focus_to.current.focus();
    }
  }, 0);
}

function get_folder_subtree_ids(folders: FolderResponse[], folder_id: string) {
  const ids = new Set<string>();
  const queue = [folder_id];

  while (queue.length > 0) {
    const current_id = queue.shift();

    if (!current_id || ids.has(current_id)) {
      continue;
    }

    ids.add(current_id);

    for (const folder of folders) {
      if (folder.parent_folder_id === current_id) {
        queue.push(folder.id);
      }
    }
  }

  return Array.from(ids);
}

function get_error_message(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
