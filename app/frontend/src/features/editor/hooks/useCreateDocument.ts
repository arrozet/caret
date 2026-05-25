import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createDocument } from "../api/documentApi";
import type { DocumentResponse } from "../api/documentApi";

interface CreateDocumentVariables {
  workspaceId: string;
  folderId?: string;
}

/**
 * TanStack Query mutation hook for creating a new untitled document.
 * Invalidates the target workspace's document list so the home screen stays fresh.
 *
 * @returns Standard useMutation result.
 */
export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation<DocumentResponse, Error, string | CreateDocumentVariables>({
    mutationFn: (variables) => {
      if (typeof variables === "string") {
        return createDocument("Untitled", variables);
      }

      return createDocument("Untitled", variables.workspaceId, variables.folderId);
    },
    onSuccess: (_document, variables) => {
      const workspaceId = typeof variables === "string" ? variables : variables.workspaceId;
      queryClient.invalidateQueries({ queryKey: ["documents", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] });
    },
  });
}
