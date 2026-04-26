import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteFolder } from "../api/documentApi";
import type { DocumentResponse } from "../api/documentApi";

interface DeleteFolderVariables {
  folderId: string;
  workspaceId: string;
  documentIds: string[];
}

/**
 * TanStack Query mutation hook for deleting a folder.
 * Refreshes folder and document lists so removed containers disappear.
 *
 * @returns Standard useMutation result.
 */
export function useDeleteFolder() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DeleteFolderVariables>({
    mutationFn: ({ folderId }) => deleteFolder(folderId),
    onSuccess: (_result, { workspaceId, documentIds }) => {
      queryClient.removeQueries({ queryKey: ["folders", workspaceId], exact: true });

      const deleted_document_ids = new Set(documentIds);
      const cached_document_entries = queryClient.getQueriesData<DocumentResponse>({
        queryKey: ["document"],
      });

      for (const documentId of deleted_document_ids) {
        queryClient.removeQueries({ queryKey: ["document", documentId], exact: true });
      }

      for (const [query_key, cached_document] of cached_document_entries) {
        const document_id = query_key[1];

        if (
          cached_document?.workspace_id !== workspaceId ||
          typeof document_id !== "string" ||
          deleted_document_ids.has(document_id)
        ) {
          continue;
        }

        queryClient.invalidateQueries({ queryKey: ["document", document_id] });
      }

      queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["documents", workspaceId] });
    },
  });
}
