import { api_fetch } from "../../../lib/apiClient";

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
  /** Workspace kind. */
  kind: "personal" | "shared";
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
 * Response payload for a direct document share.
 */
export interface InviteDocumentCollaboratorResponse {
  /** Document that now includes the invited member. */
  document_id: string;
  /** User id of the invited account. */
  user_id: string;
  /** Email used for the invite lookup. */
  email: string;
  /** Assigned document role for this MVP flow. */
  role: "owner" | "editor" | "commenter" | "viewer";
  /** Share scope for this response. */
  scope: "document";
}

/**
 * Create a new document in a workspace.
 * @param title - Document title.
 * @param workspace_id - Target workspace UUID.
 * @param folder_id - Optional folder placement.
 * @returns The created document.
 */
export function createDocument(
  title: string,
  workspaceId: string,
  folderId?: string,
): Promise<DocumentResponse> {
  return api_fetch<DocumentResponse>("/documents", {
    method: "POST",
    body: JSON.stringify({ title, workspace_id: workspaceId, folder_id: folderId }),
  });
}

/**
 * List all documents in a workspace.
 * @param workspace_id - Workspace UUID scope.
 * @returns Array of documents.
 */
export function listDocuments(workspaceId: string): Promise<DocumentResponse[]> {
  return api_fetch<DocumentResponse[]>(
    `/documents?workspace_id=${encodeURIComponent(workspaceId)}`,
  );
}

/**
 * Fetch a single document by ID (includes latest version content).
 * @param document_id - Document UUID.
 * @returns The document with content.
 */
export function getDocument(documentId: string): Promise<DocumentResponse> {
  return api_fetch<DocumentResponse>(`/documents/${documentId}`);
}

/**
 * Update a document's title and/or content.
 * @param document_id - Document UUID.
 * @param data - Partial update fields.
 * @returns The updated document.
 */
export function updateDocument(
  documentId: string,
  data: {
    title?: string;
    content_json?: Record<string, unknown>;
    content_text?: string;
  },
): Promise<DocumentResponse> {
  return api_fetch<DocumentResponse>(`/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * Soft-delete a document.
 * @param document_id - Document UUID.
 */
export function deleteDocument(documentId: string): Promise<void> {
  return api_fetch<void>(`/documents/${documentId}`, {
    method: "DELETE",
  });
}

/**
 * Create a new workspace.
 * @param name - Workspace display name.
 * @param slug - Optional URL slug.
 * @returns The created workspace.
 */
export function createWorkspace(
  name: string,
  slug?: string,
  kind?: "personal" | "shared",
): Promise<WorkspaceResponse> {
  return api_fetch<WorkspaceResponse>("/workspaces", {
    method: "POST",
    body: JSON.stringify({ name, slug, kind }),
  });
}

/**
 * List all workspaces the authenticated user belongs to.
 * @returns Array of workspaces.
 */
export function listWorkspaces(): Promise<WorkspaceResponse[]> {
  return api_fetch<WorkspaceResponse[]>("/workspaces");
}

/**
 * List documents shared directly with the current user.
 * @returns Array of directly shared documents.
 */
export function listSharedDocuments(): Promise<DocumentResponse[]> {
  return api_fetch<DocumentResponse[]>("/documents/shared");
}

/**
 * Invite an existing Caret user to the current document's workspace by email.
 * @param document_id - Document UUID.
 * @param email - Target user email.
 * @returns Invitation result.
 */
export function inviteDocumentCollaborator(
  documentId: string,
  email: string,
): Promise<InviteDocumentCollaboratorResponse> {
  return api_fetch<InviteDocumentCollaboratorResponse>(`/documents/${documentId}/invite`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/**
 * Invite a collaborator to an entire workspace by email.
 * @param workspaceId - Workspace UUID.
 * @param email - Target user email.
 * @returns Invitation result.
 */
export function inviteWorkspaceCollaborator(
  workspaceId: string,
  email: string,
): Promise<InviteCollaboratorResponse> {
  return api_fetch<InviteCollaboratorResponse>(`/workspaces/${workspaceId}/invite`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
