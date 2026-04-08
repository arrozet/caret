import { useQuery } from "@tanstack/react-query";
import { get_document } from "../api/document_api";
import type { DocumentResponse } from "../api/document_api";

/**
 * TanStack Query hook to fetch a single document by ID.
 * Includes the latest version content (content_json, content_text).
 *
 * @param document_id - Document UUID. The query is disabled if falsy.
 * @returns Standard useQuery result with typed document data.
 */
export function useDocument(document_id: string | undefined) {
  return useQuery<DocumentResponse>({
    queryKey: ["document", document_id],
    queryFn: () => get_document(document_id!),
    enabled: !!document_id,
  });
}
