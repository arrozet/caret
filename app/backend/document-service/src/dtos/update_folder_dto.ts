/**
 * DTO for updating an existing folder.
 * All fields are optional — only provided fields will be updated.
 */
export interface UpdateFolderDto {
  /** Updated folder name. */
  name?: string;
  /** Move folder to a new parent (null = move to workspace root). */
  parent_folder_id?: string | null;
  /** Updated manual sort ordering. */
  sort_order?: number | null;
}
