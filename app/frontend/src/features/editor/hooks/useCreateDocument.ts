import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createDocument } from "../api/documentApi";
import type { DocumentResponse } from "../api/documentApi";

/**
 * TanStack Query mutation hook for creating a new untitled document.
 * Invalidates the target workspace's document list so the home screen stays fresh.
 *
 * @returns Standard useMutation result.
 */
export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation<DocumentResponse, Error, string>({
    mutationFn: (workspaceId) => createDocument("Untitled", workspaceId),
    onSuccess: (_document, workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ["documents", workspaceId] });
    },
  });
}
