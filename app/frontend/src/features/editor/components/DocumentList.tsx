import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FileText, Loader2 } from "lucide-react";
import { use_documents } from "../hooks/use_documents";
import { use_workspaces, use_create_workspace } from "../hooks/use_workspaces";
import { create_document } from "../api/document_api";

/**
 * Document list page.
 *
 * Shows the user's workspaces and documents. Provides a "New document"
 * button to create documents. If no workspace exists, the user is
 * prompted to create one first (auto-created on first visit).
 */
export function DocumentList() {
  const navigate = useNavigate();
  const query_client = useQueryClient();

  const { data: workspaces, isLoading: workspaces_loading } = use_workspaces();
  const create_workspace_mutation = use_create_workspace();

  /* Use the first workspace as the active workspace for this PoC */
  const active_workspace = workspaces?.[0];

  const {
    data: documents,
    isLoading: documents_loading,
    error: documents_error,
  } = use_documents(active_workspace?.id);

  const [is_creating, set_is_creating] = useState(false);

  const create_doc_mutation = useMutation({
    mutationFn: (workspace_id: string) =>
      create_document("Untitled", workspace_id),
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
        const new_workspace =
          await create_workspace_mutation.mutateAsync({
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
    <div className="flex flex-1 flex-col p-8">
      <div className="mx-auto w-full max-w-[var(--max-width-document)]">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="font-ui text-display text-text-primary">Documents</h1>
          <button
            onClick={handle_create_document}
            disabled={is_creating}
            className="flex items-center gap-2 rounded-base bg-accent-main px-4 py-2 text-ui-base text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {is_creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            New document
          </button>
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="mb-4 h-12 w-12 text-text-secondary opacity-40" />
            <p className="text-ui-lg text-text-secondary">
              No documents yet
            </p>
            <p className="mt-1 text-ui-base text-text-secondary opacity-70">
              Click "New document" to get started.
            </p>
          </div>
        )}

        {/* Document list */}
        {!is_loading && documents && documents.length > 0 && (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li key={doc.id}>
                <button
                  onClick={() => navigate(`/documents/${doc.id}`)}
                  className="flex w-full items-center gap-3 rounded-base bg-surface p-4 text-left shadow-subtle transition-shadow hover:shadow-elevated"
                >
                  <FileText className="h-5 w-5 shrink-0 text-text-secondary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui-lg font-medium text-text-primary">
                      {doc.title || "Untitled"}
                    </p>
                    <p className="text-ui-sm text-text-secondary">
                      Updated{" "}
                      {new Date(doc.updated_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
