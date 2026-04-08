import { useQuery } from "@tanstack/react-query";
import { list_documents } from "../api/document_api";
import type { DocumentResponse } from "../api/document_api";

/**
 * TanStack Query hook to fetch all documents in a workspace.
 *
 * @param workspace_id - Workspace UUID. The query is disabled if falsy.
 * @returns Standard useQuery result with typed document array.
 */
export function useDocuments(workspace_id: string | undefined) {
  return useQuery<DocumentResponse[]>({
    queryKey: ["documents", workspace_id],
    queryFn: () => list_documents(workspace_id!),
    enabled: !!workspace_id,
  });
}
