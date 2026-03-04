/**
 * DTO for document API responses.
 * Shapes the document data returned to the client.
 */
export interface DocumentResponseDto {
  /** Document UUID. */
  id: string;
  /** Workspace this document belongs to. */
  workspace_id: string;
  /** Folder this document is in (null = workspace root). */
  folder_id: string | null;
  /** Document title. */
  title: string;
  /** Lifecycle status (active/archived). */
  status: string;
  /** Access scope (private/workspace/link/public). */
  visibility: string;
  /** Document owner user ID. */
  owner_user_id: string | null;
  /** Latest version content (ProseMirror JSON), if loaded. */
  content_json?: Record<string, unknown> | null;
  /** Latest version plain text, if loaded. */
  content_text?: string | null;
  /** Row creation timestamp (ISO 8601). */
  created_at: string;
  /** Row last-update timestamp (ISO 8601). */
  updated_at: string;
}
