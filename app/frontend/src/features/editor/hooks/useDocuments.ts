import { useQuery } from "@tanstack/react-query";
import { listDocuments } from "../api/documentApi";
import type { DocumentResponse } from "../api/documentApi";

/**
 * TanStack Query hook to fetch all documents in a workspace.
 *
 * @param workspace_id - Workspace UUID. The query is disabled if falsy.
 * @returns Standard useQuery result with typed document array.
 */
export function useDocuments(workspaceId: string | undefined) {
  return useQuery<DocumentResponse[]>({
    queryKey: ["documents", workspaceId],
    queryFn: () => listDocuments(workspaceId!),
    enabled: !!workspaceId,
  });
}
