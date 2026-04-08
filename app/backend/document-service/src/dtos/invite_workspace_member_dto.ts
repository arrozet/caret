/**
 * DTO for inviting a workspace member by email.
 * Validated at the controller boundary.
 */
export interface InviteWorkspaceMemberDto {
  /** Email address of the target user to invite. */
  email: string;
}
