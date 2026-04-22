import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listWorkspaces, createWorkspace } from "../api/documentApi";
import type { WorkspaceResponse } from "../api/documentApi";

/**
 * TanStack Query hook to fetch all workspaces for the authenticated user.
 * @returns Standard useQuery result with typed workspace array.
 */
export function useWorkspaces() {
  return useQuery<WorkspaceResponse[]>({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });
}

/**
 * TanStack Query mutation hook for creating a new workspace.
 * Invalidates the workspaces list cache on success.
 * @returns Standard useMutation result.
 */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation<
    WorkspaceResponse,
    Error,
    { name: string; slug?: string; kind?: "personal" | "shared" }
  >({
    mutationFn: ({ name, slug, kind }) => createWorkspace(name, slug, kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}
