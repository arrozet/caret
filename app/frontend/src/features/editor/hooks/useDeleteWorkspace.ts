import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteWorkspace } from "../api/documentApi";

/**
 * TanStack Query mutation hook for deleting a workspace.
 * Invalidates workspace and document queries so removed content disappears.
 *
 * @returns Standard useMutation result.
 */
export function useDeleteWorkspace() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (workspaceId) => deleteWorkspace(workspaceId),
    onSuccess: (_result, workspaceId) => {
      queryClient.removeQueries({ queryKey: ["documents", workspaceId], exact: true });
      queryClient.removeQueries({ queryKey: ["document"] });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["document"] });
      queryClient.invalidateQueries({ queryKey: ["shared-documents"] });
    },
  });
}
