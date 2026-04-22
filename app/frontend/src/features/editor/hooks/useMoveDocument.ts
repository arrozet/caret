import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateDocument } from "../api/documentApi";
import type { DocumentResponse } from "../api/documentApi";

interface MoveDocumentVariables {
  documentId: string;
  workspaceId: string;
}

/**
 * TanStack Query mutation hook for moving a document into another workspace.
 * Invalidates document and workspace lists so the home screen and editor stay in sync.
 *
 * @returns Standard useMutation result.
 */
export function useMoveDocument() {
  const queryClient = useQueryClient();

  return useMutation<DocumentResponse, Error, MoveDocumentVariables>({
    mutationFn: ({ documentId, workspaceId }) =>
      updateDocument(documentId, { workspace_id: workspaceId, folder_id: null }),
    onSuccess: (document) => {
      queryClient.setQueryData(["document", document.id], document);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["shared-documents"] });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}
