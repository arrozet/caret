import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateDocument } from "../api/documentApi";
import type { DocumentResponse } from "../api/documentApi";

/**
 * TanStack Query mutation hook for saving document content.
 * Invalidates relevant query caches on success so lists and
 * individual document views stay fresh.
 *
 * @param document_id - Document UUID to save.
 * @returns Standard useMutation result.
 */
export function useSaveDocument(documentId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    DocumentResponse,
    Error,
    { title?: string; content_json?: Record<string, unknown>; content_text?: string }
  >({
    mutationFn: (data) => updateDocument(documentId, data),
    onSuccess: (updatedDoc) => {
      /* Update the single-document cache immediately */
      queryClient.setQueryData(["document", documentId], updatedDoc);
      /* Invalidate the list so it picks up the new updated_at */
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}
