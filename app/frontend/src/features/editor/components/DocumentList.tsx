import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Loader2, MoveRight, Plus } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { NotificationToast } from "../../../components/ui/NotificationToast";
import type { DocumentResponse, WorkspaceResponse } from "../api/documentApi";
import { useCreateDocument } from "../hooks/useCreateDocument";
import { useMoveDocument } from "../hooks/useMoveDocument";
import { useDocuments, useSharedDocuments } from "../hooks/useDocuments";
import { useCreateWorkspace, useWorkspaces } from "../hooks/useWorkspaces";

type WorkspaceKind = "personal" | "shared";

interface MoveTarget {
  document: DocumentResponse;
  workspace_id: string;
}

/**
 * Documents home page.
 *
 * Groups the user's content into personal workspaces, shared workspaces,
 * and directly shared documents.
 */
export function DocumentList() {
  const navigate = useNavigate();

  const { data: workspaces = [], isLoading: workspaces_loading } = useWorkspaces();
  const { data: shared_documents = [], isLoading: shared_documents_loading } = useSharedDocuments();
  const create_workspace_mutation = useCreateWorkspace();

  const [toast_message, set_toast_message] = useState<string | null>(null);
  const [move_target, set_move_target] = useState<MoveTarget | null>(null);
  const [move_workspace_id, set_move_workspace_id] = useState("");

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

  async function handle_new_workspace() {
    await create_workspace_mutation.mutateAsync({ name: "New workspace", kind: "shared" });
  }

  async function handle_blank_document() {
    const target_workspace =
      primary_personal_workspace ??
      (await create_workspace_mutation.mutateAsync({ name: "My Documents", kind: "personal" }));
    const document = await create_document_mutation.mutateAsync(target_workspace.id);
    navigate(`/documents/${document.id}`);
  }

  function handle_request_move(document: DocumentResponse) {
    const default_workspace = shared_workspaces[0]?.id ?? "";
    set_move_target({ document, workspace_id: default_workspace });
    set_move_workspace_id(default_workspace);
  }

  async function handle_confirm_move() {
    if (!move_target || !move_workspace_id) {
      return;
    }

    await move_document_mutation.mutateAsync({
      documentId: move_target.document.id,
      workspaceId: move_workspace_id,
    });
    set_move_target(null);
    set_move_workspace_id("");
  }

  const is_loading = workspaces_loading || shared_documents_loading;

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-app">
      <div className="mx-auto w-full max-w-[var(--max-width-document-wide)] p-6 md:p-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-ui text-display text-text-primary">Documents</h1>
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
              isLoading={create_document_mutation.isPending}
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
                      workspace_kind="shared"
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
          workspaces={shared_workspaces}
          selected_workspace_id={move_workspace_id}
          on_select_workspace={set_move_workspace_id}
          on_cancel={() => set_move_target(null)}
          on_confirm={handle_confirm_move}
          is_loading={move_document_mutation.isPending}
        />
      ) : null}
    </div>
  );
}

interface WorkspaceSectionProps {
  workspace: WorkspaceResponse;
  onOpenDocument: (document_id: string) => void;
  onRequestMove?: (document: DocumentResponse) => void;
}

function WorkspaceSection({ workspace, onOpenDocument, onRequestMove }: WorkspaceSectionProps) {
  const { data: documents = [], isLoading } = useDocuments(workspace.id);

  return (
    <section className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-ui-base font-medium text-text-primary">{workspace.name}</h3>
          <p className="text-ui-sm text-text-secondary">
            {workspace.kind === "personal" ? "Personal workspace" : "Shared workspace"}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-ui-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading documents
        </div>
      ) : documents.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              workspace_kind={workspace.kind}
              onOpen={() => onOpenDocument(document.id)}
              onRequestMove={onRequestMove}
            />
          ))}
        </div>
      ) : (
        <p className="text-ui-sm text-text-secondary">No documents yet.</p>
      )}
    </section>
  );
}

interface DocumentCardProps {
  document: DocumentResponse;
  workspace_kind: WorkspaceKind;
  onOpen: () => void;
  onRequestMove?: (document: DocumentResponse) => void;
}

function DocumentCard({ document, workspace_kind, onOpen, onRequestMove }: DocumentCardProps) {
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

        {workspace_kind === "personal" && onRequestMove ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRequestMove(document)}
            className="mt-auto w-full"
          >
            <MoveRight className="h-4 w-4" />
            Move to workspace
          </Button>
        ) : null}
      </div>
    </article>
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
  on_select_workspace: (workspace_id: string) => void;
  on_cancel: () => void;
  on_confirm: () => void;
  is_loading: boolean;
}

function MoveDocumentDialog({
  document_title,
  workspaces,
  selected_workspace_id,
  on_select_workspace,
  on_cancel,
  on_confirm,
  is_loading,
}: MoveDocumentDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-5 shadow-elevated">
        <h2 className="text-ui-lg font-semibold text-text-primary">Move document</h2>
        <p className="mt-1 text-ui-sm text-text-secondary">
          Choose a shared workspace for {document_title || "this document"}.
        </p>

        <div className="mt-4 space-y-2">
          {workspaces.length > 0 ? (
            workspaces.map((workspace) => (
              <label
                key={workspace.id}
                className="flex items-center gap-3 rounded-[4px] border border-border-subtle px-3 py-2 text-ui-sm text-text-primary"
              >
                <input
                  type="radio"
                  name="move-workspace"
                  checked={selected_workspace_id === workspace.id}
                  onChange={() => on_select_workspace(workspace.id)}
                />
                {workspace.name}
              </label>
            ))
          ) : (
            <p className="text-ui-sm text-text-secondary">Create a shared workspace first.</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={on_cancel}>
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
      </div>
    </div>
  );
}
