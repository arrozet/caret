import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateFolder } from "../api/documentApi";
import type { FolderResponse } from "../api/documentApi";

interface UpdateFolderVariables {
  folderId: string;
  data: {
    name?: string;
    parentFolderId?: string | null;
    sortOrder?: number | null;
  };
}

/**
 * TanStack Query mutation hook for renaming or moving a folder.
 * Invalidates folder and document lists for the affected workspace.
 *
 * @returns Standard useMutation result.
 */
export function useUpdateFolder() {
  const queryClient = useQueryClient();

  return useMutation<FolderResponse, Error, UpdateFolderVariables>({
    mutationFn: ({ folderId, data }) => updateFolder(folderId, data),
    onSuccess: (folder) => {
      queryClient.invalidateQueries({ queryKey: ["folders", folder.workspace_id] });
      queryClient.invalidateQueries({ queryKey: ["documents", folder.workspace_id] });
    },
  });
}
