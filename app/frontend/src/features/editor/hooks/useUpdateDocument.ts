import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateDocument } from "../api/documentApi";
import type { DocumentResponse } from "../api/documentApi";

interface UpdateDocumentVariables {
  documentId: string;
  data: {
    title?: string;
  };
}

/**
 * TanStack Query mutation hook for renaming a document.
 * Invalidates document and workspace lists so the home screen and editor stay in sync.
 *
 * @returns Standard useMutation result.
 */
export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation<DocumentResponse, Error, UpdateDocumentVariables>({
    mutationFn: ({ documentId, data }) => updateDocument(documentId, data),
    onSuccess: (document) => {
      queryClient.setQueryData(["document", document.id], document);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["shared-documents"] });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}
