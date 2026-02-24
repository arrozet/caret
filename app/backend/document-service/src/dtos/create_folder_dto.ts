/**
 * DTO for creating a new folder.
 * Validated at the controller boundary before passing to the service layer.
 */
export interface CreateFolderDto {
  /** Workspace the folder belongs to (required). */
  workspace_id: string;
  /** Parent folder ID for nesting (null = workspace root). */
  parent_folder_id?: string | null;
  /** Folder display name (required). */
  name: string;
  /** Optional manual sort ordering within the parent. */
  sort_order?: number;
}
