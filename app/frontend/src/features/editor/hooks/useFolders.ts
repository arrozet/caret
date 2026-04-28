import { useQuery } from "@tanstack/react-query";
import { listAllFolders } from "../api/documentApi";
import type { FolderResponse } from "../api/documentApi";

/**
 * TanStack Query hook to fetch all folders in a workspace for tree rendering.
 *
 * @param workspaceId - Workspace UUID. The query is disabled if falsy.
 * @returns Standard useQuery result with typed folder array.
 */
export function useFolders(workspaceId: string | undefined) {
  return useQuery<FolderResponse[]>({
    queryKey: ["folders", workspaceId],
    queryFn: () => listAllFolders(workspaceId!),
    enabled: !!workspaceId,
  });
}
