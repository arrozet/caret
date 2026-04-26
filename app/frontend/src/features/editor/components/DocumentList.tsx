import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Folder, Loader2, MoveRight, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
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
  const page_heading_ref = useRef<HTMLHeadingElement | null>(null);

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

  const seen_shared_workspace_ids_ref = useRef(new Set<string>());
  const seen_shared_document_ids_ref = useRef(new Set<string>());
  const has_baseline_ref = useRef(false);

  const personal_workspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.kind === "personal"),
    [workspaces],
  );
  const shared_workspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.kind === "shared"),
    [workspaces],
  );
  const primary_personal_workspace = personal_workspaces[0] ?? null;
  const create_document_mutation = useCreateDocument();
  const move_document_mutation = useMoveDocument();

  useEffect(() => {
    if (workspaces_loading || shared_documents_loading) {
      return;
    }

    const current_shared_workspace_ids = new Set(
      shared_workspaces.map((workspace) => workspace.id),
    );
    const current_shared_document_ids = new Set(shared_documents.map((document) => document.id));

    if (!has_baseline_ref.current) {
      seen_shared_workspace_ids_ref.current = current_shared_workspace_ids;
      seen_shared_document_ids_ref.current = current_shared_document_ids;
      has_baseline_ref.current = true;
      return;
    }

    const new_shared_workspace = shared_workspaces.find(
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
  }, [shared_documents, shared_documents_loading, shared_workspaces, workspaces_loading]);

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
      await create_workspace_mutation.mutateAsync({ name: "New workspace", kind: "shared" });
    } catch (error) {
      set_toast_message(get_error_message(error));
    }
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
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1
              ref={page_heading_ref}
              tabIndex={-1}
              className="font-ui text-display text-text-primary"
            >
              Documents
            </h1>
            <p className="mt-1 text-ui-base text-text-secondary">
              Organize personal workspaces, shared spaces, and direct shares.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={handle_new_workspace}
              isLoading={create_workspace_mutation.isPending}
            >
              <Plus className="h-4 w-4" />
              New workspace
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handle_blank_document}
              isLoading={blank_document_pending || create_document_mutation.isPending}
              disabled={blank_document_pending || create_document_mutation.isPending}
            >
              <FileText className="h-4 w-4" />
              Blank document
            </Button>
          </div>
        </div>

        {is_loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
          </div>
        ) : (
          <div className="space-y-10">
            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-ui-lg font-medium text-text-primary">Personal workspace</h2>
              </div>
              {personal_workspaces.length > 0 ? (
                <div className="space-y-4">
                  {personal_workspaces.map((workspace) => (
                    <WorkspaceSection
                      key={workspace.id}
                      workspace={workspace}
                      onOpenDocument={(document_id) => navigate(`/documents/${document_id}`)}
                      onRequestMove={handle_request_move}
                      onRequestRenameWorkspace={(target_workspace, trigger_element) =>
                        set_rename_workspace({
                          workspace: target_workspace,
                          name: target_workspace.name,
                          return_focus_to: trigger_element,
                        })
                      }
                      onRequestDeleteWorkspace={(target_workspace, trigger_element) =>
                        set_delete_workspace({
                          workspace: target_workspace,
                          return_focus_to: trigger_element,
                        })
                      }
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
                  ))}
                </div>
              ) : (
                <EmptyWorkspaceState onCreate={handle_blank_document} />
              )}
            </section>

            {shared_workspaces.length > 0 ? (
              <section className="space-y-4">
                <h2 className="text-ui-lg font-medium text-text-primary">Shared workspaces</h2>
                <div className="space-y-4">
                  {shared_workspaces.map((workspace) => (
                    <WorkspaceSection
                      key={workspace.id}
                      workspace={workspace}
                      onOpenDocument={(document_id) => navigate(`/documents/${document_id}`)}
                      onRequestMove={handle_request_move}
                      onRequestRenameWorkspace={(target_workspace, trigger_element) =>
                        set_rename_workspace({
                          workspace: target_workspace,
                          name: target_workspace.name,
                          return_focus_to: trigger_element,
                        })
                      }
                      onRequestDeleteWorkspace={(target_workspace, trigger_element) =>
                        set_delete_workspace({
                          workspace: target_workspace,
                          return_focus_to: trigger_element,
                        })
                      }
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
                  ))}
                </div>
              </section>
            ) : null}

            {shared_documents.length > 0 ? (
              <section className="space-y-4">
                <h2 className="text-ui-lg font-medium text-text-primary">
                  Directly shared documents
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
  onOpenDocument: (document_id: string) => void;
  onRequestMove?: (document: DocumentResponse, trigger_element: HTMLElement | null) => void;
  onRequestRenameWorkspace?: (
    workspace: WorkspaceResponse,
    trigger_element: HTMLElement | null,
  ) => void;
  onRequestDeleteWorkspace?: (
    workspace: WorkspaceResponse,
    trigger_element: HTMLElement | null,
  ) => void;
  onRequestRenameDocument?: (
    document: DocumentResponse,
    trigger_element: HTMLElement | null,
  ) => void;
  onRequestDeleteDocument?: (
    document: DocumentResponse,
    trigger_element: HTMLElement | null,
  ) => void;
  onToast: (message: string | null) => void;
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

interface ShareWorkspaceState {
  email: string;
  return_focus_to: HTMLElement | null;
}

function WorkspaceSection({
  workspace,
  onOpenDocument,
  onRequestMove,
  onRequestRenameWorkspace,
  onRequestDeleteWorkspace,
  onRequestRenameDocument,
  onRequestDeleteDocument,
  onToast,
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
  const [selected_folder_id_state, set_selected_folder_id] = useState<string | null>(null);
  const [create_folder, set_create_folder] = useState<CreateFolderState | null>(null);
  const [rename_folder, set_rename_folder] = useState<RenameFolderState | null>(null);
  const [delete_folder, set_delete_folder] = useState<DeleteFolderState | null>(null);
  const [share_workspace, set_share_workspace] = useState<ShareWorkspaceState | null>(null);

  const folder_entries = useMemo(() => build_folder_tree_entries(folders), [folders]);
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
  const visible_documents = useMemo(
    () => documents.filter((document) => (document.folder_id ?? null) === selected_folder_id),
    [documents, selected_folder_id],
  );
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

  return (
    <section className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-ui-base font-medium text-text-primary">{workspace.name}</h3>
          <p className="text-ui-sm text-text-secondary">
            {workspace.kind === "personal" ? "Personal workspace" : "Shared workspace"}
          </p>
        </div>

        {can_share_workspace ||
        (can_manage_workspace && (onRequestRenameWorkspace || onRequestDeleteWorkspace)) ? (
          <div className="flex items-center gap-2">
            {can_share_workspace ? (
              <button
                type="button"
                onClick={(event) =>
                  set_share_workspace({
                    email: "",
                    return_focus_to: event.currentTarget as HTMLElement,
                  })
                }
                className="rounded-[4px] p-2 text-text-secondary transition hover:bg-app hover:text-text-primary"
                aria-label={`Share workspace ${workspace.name}`}
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            {can_manage_workspace ? (
              <>
                <button
                  type="button"
                  onClick={(event) =>
                    onRequestRenameWorkspace?.(workspace, event.currentTarget as HTMLElement)
                  }
                  className="rounded-[4px] p-2 text-text-secondary transition hover:bg-app hover:text-text-primary"
                  aria-label={`Rename workspace ${workspace.name}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={(event) =>
                    onRequestDeleteWorkspace?.(workspace, event.currentTarget as HTMLElement)
                  }
                  className="rounded-[4px] p-2 text-text-secondary transition hover:bg-app hover:text-text-primary"
                  aria-label={`Delete workspace ${workspace.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="space-y-3 rounded-lg border border-border-subtle bg-app/40 p-3 lg:w-64">
          <div className="flex items-center justify-between gap-2">
            <p className="text-ui-sm font-medium text-text-primary">Folders</p>
            {can_manage_workspace ? (
              <button
                type="button"
                onClick={(event) =>
                  set_create_folder({
                    name: "",
                    parent_folder_id: selected_folder_id,
                    return_focus_to: event.currentTarget as HTMLElement,
                  })
                }
                className="rounded-[4px] p-2 text-text-secondary transition hover:bg-surface hover:text-text-primary"
                aria-label="New folder"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="space-y-1">
            <button
              type="button"
              onClick={() => set_selected_folder_id(null)}
              className={folder_button_class_name(selected_folder_id === null)}
              aria-pressed={selected_folder_id === null}
            >
              Root
            </button>

            {folders_loading ? (
              <div className="flex items-center gap-2 px-2 py-1 text-ui-sm text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading folders
              </div>
            ) : folder_entries.length > 0 ? (
              folder_entries.map(({ folder, depth }) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => set_selected_folder_id(folder.id)}
                  className={folder_button_class_name(selected_folder_id === folder.id)}
                  style={{ paddingLeft: `${depth * 16 + 12}px` }}
                  aria-label={`${folder.name} folder`}
                  aria-pressed={selected_folder_id === folder.id}
                >
                  <Folder className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{folder.name}</span>
                </button>
              ))
            ) : (
              <p className="px-2 py-1 text-ui-sm text-text-secondary">No folders yet.</p>
            )}
          </div>

          {selected_folder && can_manage_workspace ? (
            <div className="flex items-center gap-2 border-t border-border-subtle pt-2">
              <button
                type="button"
                onClick={(event) =>
                  set_rename_folder({
                    folder: selected_folder,
                    name: selected_folder.name,
                    return_focus_to: event.currentTarget as HTMLElement,
                  })
                }
                className="rounded-[4px] p-2 text-text-secondary transition hover:bg-surface hover:text-text-primary"
                aria-label={`Rename folder ${selected_folder.name}`}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={(event) =>
                  set_delete_folder({
                    folder: selected_folder,
                    return_focus_to: event.currentTarget as HTMLElement,
                  })
                }
                className="rounded-[4px] p-2 text-text-secondary transition hover:bg-surface hover:text-text-primary"
                aria-label={`Delete folder ${selected_folder.name}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-ui-sm text-text-secondary">
              {selected_folder ? `Showing ${selected_folder.name}` : "Showing workspace root"}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={handle_create_document}
              isLoading={create_document_mutation.isPending}
            >
              <FileText className="h-4 w-4" />
              New document
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-ui-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading documents
            </div>
          ) : visible_documents.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
          ) : (
            <p className="text-ui-sm text-text-secondary">No documents yet.</p>
          )}
        </div>
      </div>

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

function DocumentCard({
  document,
  onOpen,
  onRequestMove,
  onRequestRename,
  onRequestDelete,
}: DocumentCardProps) {
  return (
    <article className="group flex min-h-[184px] flex-col rounded-lg border border-border-subtle bg-surface shadow-sm transition hover:border-accent-main/30 hover:shadow-elevated">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-32 items-center justify-center border-b border-border-subtle bg-app/40 px-4 text-center"
        aria-label={`Open ${document.title || "Untitled"}`}
      >
        <FileText className="h-10 w-10 text-text-secondary/70" aria-hidden="true" />
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="truncate text-ui-base font-medium text-text-primary">
            {document.title || "Untitled"}
          </p>
          <p className="mt-1 text-ui-sm text-text-secondary">
            Updated {new Date(document.updated_at).toLocaleDateString()}
          </p>
        </div>

        <div className="mt-auto flex gap-2">
          {onRequestRename ? (
            <button
              type="button"
              onClick={(event) => onRequestRename(event.currentTarget as HTMLElement)}
              className="rounded-[4px] p-2 text-text-secondary transition hover:bg-app hover:text-text-primary"
              aria-label={`Rename ${document.title || "Untitled"}`}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}

          {onRequestDelete ? (
            <button
              type="button"
              onClick={(event) => onRequestDelete(event.currentTarget as HTMLElement)}
              className="rounded-[4px] p-2 text-text-secondary transition hover:bg-app hover:text-text-primary"
              aria-label={`Delete ${document.title || "Untitled"}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}

          {onRequestMove ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={(event) => onRequestMove(document, event.currentTarget as HTMLElement)}
              className="w-full"
              aria-label={`Move document ${document.title || "Untitled"}`}
            >
              <MoveRight className="h-4 w-4" />
              Move
            </Button>
          ) : null}
        </div>
      </div>
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
    <div className="rounded-lg border border-dashed border-border-subtle bg-surface p-6 text-center">
      <p className="text-ui-base text-text-primary">No personal workspace yet.</p>
      <p className="mt-1 text-ui-sm text-text-secondary">
        Create a blank document to bootstrap your private home workspace.
      </p>
      <div className="mt-4">
        <Button variant="secondary" size="sm" onClick={onCreate}>
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

  useEffect(() => {
    if (selected_folder_id === null) {
      return;
    }

    if (!folders.some((folder) => folder.id === selected_folder_id)) {
      on_select_folder(null);
    }
  }, [folders, on_select_folder, selected_folder_id]);

  return (
    <ModalDialog
      title="Move document"
      description={`Choose a workspace and folder for ${document_title || "this document"}.`}
      on_close={on_cancel}
      initial_focus_ref={initial_focus_ref}
    >
      <div className="mt-4 space-y-2">
        {workspaces.length > 0 ? (
          workspaces.map((workspace) => (
            <label
              key={workspace.id}
              className="flex items-center gap-3 rounded-[4px] border border-border-subtle px-3 py-2 text-ui-sm text-text-primary"
            >
              <input
                ref={(node) => {
                  if (
                    node &&
                    (selected_workspace_id === workspace.id ||
                      (!selected_workspace_id && workspace === workspaces[0]))
                  ) {
                    initial_focus_ref.current = node;
                  }
                }}
                type="radio"
                name="move-workspace"
                checked={selected_workspace_id === workspace.id}
                onChange={() => on_select_workspace(workspace.id)}
              />
              {workspace.name}
            </label>
          ))
        ) : (
          <p className="text-ui-sm text-text-secondary">Create a workspace first.</p>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-ui-sm font-medium text-text-primary">Destination folder</p>
        <label className="flex items-center gap-3 rounded-[4px] border border-border-subtle px-3 py-2 text-ui-sm text-text-primary">
          <input
            type="radio"
            name="move-folder"
            checked={selected_folder_id === null}
            onChange={() => on_select_folder(null)}
          />
          Root
        </label>
        {folders.map((folder) => (
          <label
            key={folder.id}
            className="flex items-center gap-3 rounded-[4px] border border-border-subtle px-3 py-2 text-ui-sm text-text-primary"
          >
            <input
              type="radio"
              name="move-folder"
              checked={selected_folder_id === folder.id}
              onChange={() => on_select_folder(folder.id)}
            />
            {folder.name}
          </label>
        ))}
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

function build_folder_tree_entries(folders: FolderResponse[]) {
  const by_parent = new Map<string | null, FolderResponse[]>();

  for (const folder of folders) {
    const siblings = by_parent.get(folder.parent_folder_id) ?? [];
    siblings.push(folder);
    by_parent.set(folder.parent_folder_id, siblings);
  }

  const entries: Array<{ folder: FolderResponse; depth: number }> = [];

  function visit(parent_folder_id: string | null, depth: number) {
    const children = by_parent.get(parent_folder_id) ?? [];

    for (const folder of children) {
      entries.push({ folder, depth });
      visit(folder.id, depth + 1);
    }
  }

  visit(null, 0);

  return entries;
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

function folder_button_class_name(is_selected: boolean) {
  return [
    "flex w-full items-center gap-2 rounded-[4px] px-3 py-2 text-left text-ui-sm transition",
    is_selected
      ? "bg-surface text-text-primary shadow-sm"
      : "text-text-secondary hover:bg-surface hover:text-text-primary",
  ].join(" ");
}

function get_error_message(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
