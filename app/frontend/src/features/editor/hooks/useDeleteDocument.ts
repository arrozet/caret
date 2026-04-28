import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteDocument } from "../api/documentApi";

/**
 * TanStack Query mutation hook for deleting a document.
 * Invalidates document and workspace lists so deleted content disappears.
 *
 * @returns Standard useMutation result.
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (documentId) => deleteDocument(documentId),
    onSuccess: (_result, documentId) => {
      queryClient.removeQueries({ queryKey: ["document", documentId], exact: true });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document"] });
      queryClient.invalidateQueries({ queryKey: ["shared-documents"] });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}
