/**
 * Services for the Document Service.
 * Business logic for document lifecycle: create, read, update, delete, share.
 * Receive Repositories via constructor injection (DI).
 *
 * Rule: no HTTP concepts (req, res, status codes) inside Services.
 * Rule: no direct ORM/SQL — delegate all DB access to Repositories.
 */
export { DocumentService } from "./document_service.js";
export { WorkspaceService } from "./workspace_service.js";
