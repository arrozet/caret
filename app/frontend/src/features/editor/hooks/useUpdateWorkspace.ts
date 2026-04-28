import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateWorkspace } from "../api/documentApi";
import type { WorkspaceResponse } from "../api/documentApi";

interface UpdateWorkspaceVariables {
  workspaceId: string;
  data: {
    name?: string;
  };
}

/**
 * TanStack Query mutation hook for renaming a workspace.
 * Invalidates workspace and document lists so the home screen stays in sync.
 *
 * @returns Standard useMutation result.
 */
export function useUpdateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation<WorkspaceResponse, Error, UpdateWorkspaceVariables>({
    mutationFn: ({ workspaceId, data }) => updateWorkspace(workspaceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["shared-documents"] });
    },
  });
}
