import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invite_document_collaborator, type InviteCollaboratorResponse } from "../api/document_api";

/**
 * Mutation hook to invite a collaborator to a document by email.
 * Invalidates workspace/document lists so newly invited members see updates.
 *
 * @param document_id - Document UUID.
 * @returns Standard useMutation result.
 */
export function useInviteDocumentCollaborator(document_id: string) {
  const query_client = useQueryClient();

  return useMutation<InviteCollaboratorResponse, Error, { email: string }>({
    mutationFn: ({ email }) => invite_document_collaborator(document_id, email),
    onSuccess: () => {
      query_client.invalidateQueries({ queryKey: ["workspaces"] });
      query_client.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}
