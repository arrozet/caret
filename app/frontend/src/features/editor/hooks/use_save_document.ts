import { useMutation, useQueryClient } from "@tanstack/react-query";
import { update_document } from "../api/document_api";
import type { DocumentResponse } from "../api/document_api";

/**
 * TanStack Query mutation hook for saving document content.
 * Invalidates relevant query caches on success so lists and
 * individual document views stay fresh.
 *
 * @param document_id - Document UUID to save.
 * @returns Standard useMutation result.
 */
export function use_save_document(document_id: string) {
  const query_client = useQueryClient();

  return useMutation<
    DocumentResponse,
    Error,
    { title?: string; content_json?: Record<string, unknown>; content_text?: string }
  >({
    mutationFn: (data) => update_document(document_id, data),
    onSuccess: (updated_doc) => {
      /* Update the single-document cache immediately */
      query_client.setQueryData(["document", document_id], updated_doc);
      /* Invalidate the list so it picks up the new updated_at */
      query_client.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}
