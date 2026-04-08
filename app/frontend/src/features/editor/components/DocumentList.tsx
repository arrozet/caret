import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  FileText,
  Loader2,
  Trash2,
  Pencil,
  Check,
  X,
  MoreVertical,
  Info,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { useDocuments } from "../hooks/use_documents";
import { useWorkspaces, useCreateWorkspace } from "../hooks/use_workspaces";
import { create_document, update_document, delete_document } from "../api/document_api";
import type { DocumentResponse } from "../api/document_api";

/**
 * Document list page.
 *
 * Shows the user's workspaces and documents. Provides a "New document"
 * button to create documents, and per-document actions: rename, delete.
 * If no workspace exists, the user is prompted to create one first
 * (auto-created on first visit).
 */
export function DocumentList() {
  const navigate = useNavigate();
  const query_client = useQueryClient();

  const { data: workspaces, isLoading: workspaces_loading } = useWorkspaces();
  const create_workspace_mutation = useCreateWorkspace();

  /* Use the first workspace as the active workspace for this PoC */
  const active_workspace = workspaces?.[0];

  const {
    data: documents,
    isLoading: documents_loading,
    error: documents_error,
  } = useDocuments(active_workspace?.id);

  const [is_creating, set_is_creating] = useState(false);

  const create_doc_mutation = useMutation({
    mutationFn: (workspace_id: string) => create_document("Untitled", workspace_id),
    onSuccess: (doc) => {
      query_client.invalidateQueries({ queryKey: ["documents"] });
      navigate(`/documents/${doc.id}`);
    },
  });

  /**
   * Handle creating a new document.
   * If no workspace exists, creates a default one first.
   */
  async function handle_create_document() {
    set_is_creating(true);
    try {
      let workspace_id = active_workspace?.id;

      if (!workspace_id) {
        const new_workspace = await create_workspace_mutation.mutateAsync({
          name: "My Workspace",
        });
        workspace_id = new_workspace.id;
      }

      await create_doc_mutation.mutateAsync(workspace_id);
    } finally {
      set_is_creating(false);
    }
  }

  const is_loading = workspaces_loading || documents_loading;

  return (
    <div className="flex flex-1 flex-col bg-app h-full">
      <div className="mx-auto w-full max-w-[var(--max-width-document-wide)] p-6 md:p-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-ui text-display text-text-primary">Documents</h1>
            <p className="text-ui-base text-text-secondary mt-1">Manage and edit your documents</p>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={handle_create_document}
            disabled={is_creating}
            is_loading={is_creating}
            className="shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Blank document
          </Button>
        </div>

        {/* Loading state */}
        {is_loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
          </div>
        )}

        {/* Error state */}
        {documents_error && (
          <div className="rounded-base border border-error bg-error/10 p-4 text-ui-base text-error">
            Failed to load documents: {documents_error.message}
          </div>
        )}

        {/* Empty state */}
        {!is_loading && !documents_error && documents?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-surface border border-border-subtle rounded-lg shadow-sm">
            <div className="h-16 w-16 bg-accent-main/10 text-accent-main rounded-full flex items-center justify-center mb-4">
              <FileText className="h-8 w-8" />
            </div>
            <p className="text-ui-lg font-medium text-text-primary">No documents yet</p>
            <p className="mt-1 mb-6 text-ui-base text-text-secondary max-w-sm">
              Create your first document to start writing. Documents are synced automatically.
            </p>
            <Button
              variant="primary"
              size="md"
              onClick={handle_create_document}
              disabled={is_creating}
              is_loading={is_creating}
            >
              <Plus className="h-4 w-4" />
              Blank document
            </Button>
          </div>
        )}

        {/* Document Grid */}
        {!is_loading && documents && documents.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                on_navigate={() => navigate(`/documents/${doc.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   DocumentCard — Individual document row with actions
   ============================================================ */

interface DocumentCardProps {
  /** Document data. */
  document: DocumentResponse;
  /** Navigate to the editor page. */
  on_navigate: () => void;
}

/**
 * Single document card in the list. Supports inline rename
 * and delete with confirmation.
 */
function DocumentCard({ document: doc, on_navigate }: DocumentCardProps) {
  const query_client = useQueryClient();
  const [is_renaming, set_is_renaming] = useState(false);
  const [rename_value, set_rename_value] = useState(doc.title);
  const [show_menu, set_show_menu] = useState(false);
  const [show_delete_confirm, set_show_delete_confirm] = useState(false);
  const [show_info, set_show_info] = useState(false);
  const rename_input_ref = useRef<HTMLInputElement>(null);
  const menu_ref = useRef<HTMLDivElement>(null);

  const rename_mutation = useMutation({
    mutationFn: (title: string) => update_document(doc.id, { title }),
    onSuccess: () => {
      query_client.invalidateQueries({ queryKey: ["documents"] });
      set_is_renaming(false);
    },
  });

  const delete_mutation = useMutation({
    mutationFn: () => delete_document(doc.id),
    onSuccess: () => {
      query_client.invalidateQueries({ queryKey: ["documents"] });
      set_show_delete_confirm(false);
    },
  });

  /** Start rename mode. */
  const start_rename = useCallback(() => {
    set_rename_value(doc.title);
    set_is_renaming(true);
    set_show_menu(false);
    setTimeout(() => rename_input_ref.current?.select(), 50);
  }, [doc.title]);

  /** Commit the rename. */
  const commit_rename = useCallback(async () => {
    const trimmed = rename_value.trim();
    if (!trimmed || trimmed === doc.title) {
      set_is_renaming(false);
      return;
    }
    await rename_mutation.mutateAsync(trimmed);
  }, [rename_value, doc.title, rename_mutation]);

  /** Cancel the rename. */
  const cancel_rename = useCallback(() => {
    set_rename_value(doc.title);
    set_is_renaming(false);
  }, [doc.title]);

  /** Handle keyboard events in rename input. */
  const handle_rename_key_down = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit_rename();
      } else if (e.key === "Escape") {
        cancel_rename();
      }
    },
    [commit_rename, cancel_rename],
  );

  /* Info view */
  if (show_info) {
    return (
      <div className="group relative flex flex-col rounded-lg border border-border-subtle bg-surface shadow-sm transition-all h-full min-h-[224px]">
        <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
          <Info className="h-8 w-8 text-accent-main mb-3" />
          <p className="text-ui-base text-text-primary mb-1 font-medium">Document Info</p>
          <div className="text-ui-sm text-text-secondary mb-4 space-y-1">
            <p>
              Created:{" "}
              {new Date(doc.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex gap-2 w-full justify-center">
            <Button variant="ghost" size="sm" onClick={() => set_show_info(false)}>
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* Delete confirmation */
  if (show_delete_confirm) {
    return (
      <div className="group relative flex flex-col rounded-lg border border-error/50 bg-error/5 shadow-sm transition-all h-full min-h-[224px]">
        <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
          <Trash2 className="h-8 w-8 text-error mb-3" />
          <p className="text-ui-base text-text-primary mb-1">
            Delete "<span className="font-medium">{doc.title || "Untitled"}</span>"?
          </p>
          <p className="text-ui-sm text-text-secondary mb-4">This action cannot be undone.</p>
          <div className="flex gap-2 w-full justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => set_show_delete_confirm(false)}
              disabled={delete_mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => delete_mutation.mutateAsync()}
              is_loading={delete_mutation.isPending}
              disabled={delete_mutation.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* Rename mode / Normal document card */
  return (
    <div
      className={`group relative flex flex-col rounded-lg border bg-surface shadow-sm transition-all h-full ${
        is_renaming
          ? "border-accent-main shadow-elevated"
          : "border-border-subtle hover:shadow-elevated hover:border-accent-main/30"
      }`}
    >
      {/* Visual document preview area (mock) */}
      <button
        onClick={on_navigate}
        className="flex h-40 w-full items-center justify-center bg-app/50 border-b border-border-subtle relative overflow-hidden rounded-t-[calc(var(--radius-lg)-1px)]"
        aria-label={`Open ${doc.title || "Untitled"}`}
        disabled={is_renaming}
      >
        <div className="absolute inset-0 flex flex-col p-4 opacity-30 gap-2">
          {/* Mock text lines to make it look like a document */}
          <div className="h-2 w-3/4 rounded bg-text-secondary"></div>
          <div className="h-2 w-full rounded bg-text-secondary"></div>
          <div className="h-2 w-5/6 rounded bg-text-secondary"></div>
          <div className="h-2 w-full rounded bg-text-secondary"></div>
          <div className="h-2 w-2/3 rounded bg-text-secondary"></div>
          <div className="h-2 w-full rounded bg-text-secondary"></div>
        </div>
        <FileText className="h-10 w-10 text-text-secondary opacity-50 relative z-10" />
      </button>

      {/* Info area */}
      <div className="flex flex-col p-3">
        {is_renaming ? (
          <div className="flex items-center gap-2">
            <input
              ref={rename_input_ref}
              type="text"
              value={rename_value}
              onChange={(e) => set_rename_value(e.target.value)}
              onKeyDown={handle_rename_key_down}
              onBlur={commit_rename}
              className="min-w-0 flex-1 bg-app border border-border-subtle rounded px-2 py-1 text-ui-sm font-medium text-text-primary outline-none focus:border-accent-main focus:ring-1 focus:ring-accent-main"
              placeholder="Document title"
              autoFocus
            />
            <div className="flex shrink-0">
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit_rename();
                }}
                className="p-1 rounded text-success hover:bg-success/10 cursor-pointer"
                aria-label="Confirm rename"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  cancel_rename();
                }}
                className="p-1 rounded text-text-secondary hover:bg-surface cursor-pointer"
                aria-label="Cancel rename"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <button
                onClick={on_navigate}
                className="w-full truncate text-left text-ui-base font-medium text-text-primary hover:text-accent-main"
              >
                {doc.title || "Untitled"}
              </button>
              <p className="text-ui-sm text-text-secondary mt-0.5">
                {new Date(doc.updated_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            {/* Actions menu */}
            <div ref={menu_ref} className="relative ml-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  set_show_menu(!show_menu);
                }}
                className="p-1 rounded-[4px] text-text-secondary hover:text-text-primary hover:bg-app cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Document actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {/* Dropdown menu */}
              {show_menu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => set_show_menu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-40 w-36 rounded-md bg-surface border border-border-subtle shadow-elevated py-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        set_show_info(true);
                        set_show_menu(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-ui-sm text-text-primary hover:bg-app cursor-pointer"
                    >
                      <Info className="h-3.5 w-3.5" />
                      Info
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        start_rename();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-ui-sm text-text-primary hover:bg-app cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Rename
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        set_show_delete_confirm(true);
                        set_show_menu(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-ui-sm text-error hover:bg-error/5 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
