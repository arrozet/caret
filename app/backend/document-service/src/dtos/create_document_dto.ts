/**
 * DTO for creating a new document.
 * Validated at the controller boundary before passing to the service layer.
 */
export interface CreateDocumentDto {
  /** Document title (required). */
  title: string;
  /** Workspace the document belongs to (required). */
  workspace_id: string;
  /** Optional folder placement within the workspace. */
  folder_id?: string;
}
