import { useMutation, useQueryClient } from "@tanstack/react-query";
import { inviteDocumentCollaborator, type InviteCollaboratorResponse } from "../api/documentApi";

/**
 * Mutation hook to invite a collaborator to a document by email.
 * Invalidates workspace/document lists so newly invited members see updates.
 *
 * @param document_id - Document UUID.
 * @returns Standard useMutation result.
 */
export function useInviteDocumentCollaborator(documentId: string) {
  const queryClient = useQueryClient();

  return useMutation<InviteCollaboratorResponse, Error, { email: string }>({
    mutationFn: ({ email }) => inviteDocumentCollaborator(documentId, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}
