/**
 * DTO returned after inviting a workspace member.
 */
export interface InviteWorkspaceMemberResponseDto {
  /** Workspace where the membership was created or reactivated. */
  workspace_id: string;
  /** User id of the invited member. */
  user_id: string;
  /** Email used for the invitation lookup. */
  email: string;
  /** Role assigned to the invited member. */
  role: "member";
}
