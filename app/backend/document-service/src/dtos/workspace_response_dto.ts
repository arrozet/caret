/**
 * DTO for workspace API responses.
 * Shapes the workspace data returned to the client.
 */
export interface WorkspaceResponseDto {
  /** Workspace UUID. */
  id: string;
  /** Workspace kind, used to distinguish personal home workspaces. */
  kind: "personal" | "shared";
  /** URL-friendly slug. */
  slug: string | null;
  /** Display name. */
  name: string;
  /** User who created the workspace. */
  created_by_user_id: string | null;
  /** Caller's role within this workspace (if applicable). */
  role?: string;
  /** Other active member emails this workspace is shared with (excluding caller). */
  shared_with?: string[];
  /** Row creation timestamp (ISO 8601). */
  created_at: string;
  /** Row last-update timestamp (ISO 8601). */
  updated_at: string;
}
