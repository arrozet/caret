import { api_fetch } from "../../../lib/api_client";

/**
 * Shape of a document as returned by the API.
 * Mirrors the backend DocumentResponseDto.
 */
export interface DocumentResponse {
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
  /** Latest version content (ProseMirror JSON). */
  content_json?: Record<string, unknown> | null;
  /** Latest version plain text. */
  content_text?: string | null;
  /** Row creation timestamp (ISO 8601). */
  created_at: string;
  /** Row last-update timestamp (ISO 8601). */
  updated_at: string;
}

/**
 * Shape of a workspace as returned by the API.
 * Mirrors the backend WorkspaceResponseDto.
 */
export interface WorkspaceResponse {
  /** Workspace UUID. */
  id: string;
  /** URL-friendly slug. */
  slug: string | null;
  /** Display name. */
  name: string;
  /** User who created the workspace. */
  created_by_user_id: string | null;
  /** Caller's role within this workspace. */
  role?: string;
  /** Row creation timestamp (ISO 8601). */
  created_at: string;
  /** Row last-update timestamp (ISO 8601). */
  updated_at: string;
}

/**
 * Response payload for the invite collaborator endpoint.
 */
export interface InviteCollaboratorResponse {
  /** Workspace that now includes the invited member. */
  workspace_id: string;
  /** User id of the invited account. */
  user_id: string;
  /** Email used for the invite lookup. */
  email: string;
  /** Assigned role for this MVP flow. */
  role: "member";
}

/**
 * Create a new document in a workspace.
 * @param title - Document title.
 * @param workspace_id - Target workspace UUID.
 * @param folder_id - Optional folder placement.
 * @returns The created document.
 */
export function create_document(
  title: string,
  workspace_id: string,
  folder_id?: string,
): Promise<DocumentResponse> {
  return api_fetch<DocumentResponse>("/documents", {
    method: "POST",
    body: JSON.stringify({ title, workspace_id, folder_id }),
  });
}

/**
 * List all documents in a workspace.
 * @param workspace_id - Workspace UUID scope.
 * @returns Array of documents.
 */
export function list_documents(workspace_id: string): Promise<DocumentResponse[]> {
  return api_fetch<DocumentResponse[]>(
    `/documents?workspace_id=${encodeURIComponent(workspace_id)}`,
  );
}

/**
 * Fetch a single document by ID (includes latest version content).
 * @param document_id - Document UUID.
 * @returns The document with content.
 */
export function get_document(document_id: string): Promise<DocumentResponse> {
  return api_fetch<DocumentResponse>(`/documents/${document_id}`);
}

/**
 * Update a document's title and/or content.
 * @param document_id - Document UUID.
 * @param data - Partial update fields.
 * @returns The updated document.
 */
export function update_document(
  document_id: string,
  data: {
    title?: string;
    content_json?: Record<string, unknown>;
    content_text?: string;
  },
): Promise<DocumentResponse> {
  return api_fetch<DocumentResponse>(`/documents/${document_id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * Soft-delete a document.
 * @param document_id - Document UUID.
 */
export function delete_document(document_id: string): Promise<void> {
  return api_fetch<void>(`/documents/${document_id}`, {
    method: "DELETE",
  });
}

/**
 * Create a new workspace.
 * @param name - Workspace display name.
 * @param slug - Optional URL slug.
 * @returns The created workspace.
 */
export function create_workspace(name: string, slug?: string): Promise<WorkspaceResponse> {
  return api_fetch<WorkspaceResponse>("/workspaces", {
    method: "POST",
    body: JSON.stringify({ name, slug }),
  });
}

/**
 * List all workspaces the authenticated user belongs to.
 * @returns Array of workspaces.
 */
export function list_workspaces(): Promise<WorkspaceResponse[]> {
  return api_fetch<WorkspaceResponse[]>("/workspaces");
}

/**
 * Invite an existing Caret user to the current document's workspace by email.
 * @param document_id - Document UUID.
 * @param email - Target user email.
 * @returns Invitation result.
 */
export function invite_document_collaborator(
  document_id: string,
  email: string,
): Promise<InviteCollaboratorResponse> {
  return api_fetch<InviteCollaboratorResponse>(`/documents/${document_id}/invite`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
