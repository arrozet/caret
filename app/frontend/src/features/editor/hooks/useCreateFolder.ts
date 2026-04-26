import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFolder } from "../api/documentApi";
import type { FolderResponse } from "../api/documentApi";

interface CreateFolderVariables {
  workspaceId: string;
  name: string;
  parentFolderId?: string | null;
  sortOrder?: number | null;
}

/**
 * TanStack Query mutation hook for creating a folder.
 * Invalidates folder and document lists for the affected workspace.
 *
 * @returns Standard useMutation result.
 */
export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation<FolderResponse, Error, CreateFolderVariables>({
    mutationFn: (variables) => createFolder(variables),
    onSuccess: (folder) => {
      queryClient.invalidateQueries({ queryKey: ["folders", folder.workspace_id] });
      queryClient.invalidateQueries({ queryKey: ["documents", folder.workspace_id] });
    },
  });
}
