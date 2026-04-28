import { useMutation, useQueryClient } from "@tanstack/react-query";
import { inviteWorkspaceCollaborator, type InviteCollaboratorResponse } from "../api/documentApi";

/**
 * Mutation hook to invite a collaborator to a workspace by email.
 * Invalidates workspace and shared-document lists so the UI can refresh.
 *
 * @param workspaceId - Workspace UUID.
 * @returns Standard useMutation result.
 */
export function useInviteWorkspaceCollaborator(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation<InviteCollaboratorResponse, Error, { email: string }>({
    mutationFn: ({ email }) => inviteWorkspaceCollaborator(workspaceId, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["shared-documents"] });
    },
  });
}
