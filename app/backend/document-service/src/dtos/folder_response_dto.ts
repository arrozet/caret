/**
 * DTO for folder API responses.
 * Shapes the folder data returned to the client.
 */
export interface FolderResponseDto {
  /** Folder UUID. */
  id: string;
  /** Workspace this folder belongs to. */
  workspace_id: string;
  /** Parent folder ID (null = workspace root). */
  parent_folder_id: string | null;
  /** Folder display name. */
  name: string;
  /** Manual sort ordering (null = unset). */
  sort_order: number | null;
  /** User who created this folder. */
  created_by_user_id: string | null;
  /** Row creation timestamp (ISO 8601). */
  created_at: string;
  /** Row last-update timestamp (ISO 8601). */
  updated_at: string;
}
