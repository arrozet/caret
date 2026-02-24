import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  list_workspaces,
  create_workspace,
} from "../api/document_api";
import type { WorkspaceResponse } from "../api/document_api";

/**
 * TanStack Query hook to fetch all workspaces for the authenticated user.
 * @returns Standard useQuery result with typed workspace array.
 */
export function use_workspaces() {
  return useQuery<WorkspaceResponse[]>({
    queryKey: ["workspaces"],
    queryFn: list_workspaces,
  });
}

/**
 * TanStack Query mutation hook for creating a new workspace.
 * Invalidates the workspaces list cache on success.
 * @returns Standard useMutation result.
 */
export function use_create_workspace() {
  const query_client = useQueryClient();

  return useMutation<WorkspaceResponse, Error, { name: string; slug?: string }>({
    mutationFn: ({ name, slug }) => create_workspace(name, slug),
    onSuccess: () => {
      query_client.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}
