import { useQuery } from "@tanstack/react-query";
import { getDocument } from "../api/documentApi";
import type { DocumentResponse } from "../api/documentApi";

/**
 * TanStack Query hook to fetch a single document by ID.
 * Includes the latest version content (content_json, content_text).
 *
 * @param document_id - Document UUID. The query is disabled if falsy.
 * @returns Standard useQuery result with typed document data.
 */
export function useDocument(documentId: string | undefined) {
  return useQuery<DocumentResponse>({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId!),
    enabled: !!documentId,
  });
}
