/**
 * DTO for creating a new workspace.
 * Validated at the controller boundary.
 */
export interface CreateWorkspaceDto {
  /** Workspace display name (required). */
  name: string;
  /** Optional URL-friendly slug. Auto-generated if omitted. */
  slug?: string;
  /** Workspace kind: shared by default, personal for private home workspaces. */
  kind?: "personal" | "shared";
}
