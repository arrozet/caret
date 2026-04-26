/**
 * DTO for renaming an existing workspace.
 * All fields are optional so partial updates remain possible.
 */
export interface UpdateWorkspaceDto {
  /** Updated workspace display name. */
  name?: string;
}
