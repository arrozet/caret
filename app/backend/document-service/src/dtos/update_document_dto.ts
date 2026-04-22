/**
 * DTO for updating an existing document.
 * All fields are optional — only provided fields will be updated.
 */
export interface UpdateDocumentDto {
  /** Updated document title. */
  title?: string;
  /** Updated workspace UUID when moving the document. */
  workspace_id?: string;
  /** Updated folder UUID when moving the document. */
  folder_id?: string | null;
  /** Updated ProseMirror/Tiptap document JSON content. */
  content_json?: Record<string, unknown>;
  /** Updated plain text extraction of the document content. */
  content_text?: string;
}
