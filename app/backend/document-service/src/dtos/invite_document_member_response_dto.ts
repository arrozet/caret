/**
 * DTO returned after inviting a user to a single document.
 * Distinguishes direct document shares from workspace membership invites.
 */
export interface InviteDocumentMemberResponseDto {
  /** Document UUID. */
  document_id: string;
  /** Invited user's UUID. */
  user_id: string;
  /** Invited user's email address. */
  email: string;
  /** Direct document role granted to the invited user. */
  role: "owner" | "editor" | "commenter" | "viewer";
  /** Share scope for this response. */
  scope: "document";
}
