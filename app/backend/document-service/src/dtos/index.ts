/**
 * Data Transfer Objects (DTOs) for the Document Service.
 * DTOs define the shape of HTTP request bodies and response payloads.
 *
 * Rule: DTOs are only used in Controllers and Service mapping logic.
 * Rule: DTOs must never be passed to Repositories — map them to Models first.
 */
export type { CreateDocumentDto } from "./create_document_dto.js";
export type { UpdateDocumentDto } from "./update_document_dto.js";
export type { DocumentResponseDto } from "./document_response_dto.js";
export type { CreateWorkspaceDto } from "./create_workspace_dto.js";
export type { WorkspaceResponseDto } from "./workspace_response_dto.js";
export type { InviteWorkspaceMemberDto } from "./invite_workspace_member_dto.js";
export type { InviteWorkspaceMemberResponseDto } from "./invite_workspace_member_response_dto.js";
export type { CreateFolderDto } from "./create_folder_dto.js";
export type { UpdateFolderDto } from "./update_folder_dto.js";
export type { FolderResponseDto } from "./folder_response_dto.js";
