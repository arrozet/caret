/**
 * Repositories for the Document Service.
 * Encapsulates all Drizzle ORM queries for document, workspace, and version tables.
 * Receive the db client via constructor injection (DI).
 *
 * Rule: all SQL/ORM logic lives here — never in Services.
 * Rule: accept and return domain Models, never DTOs or raw ORM rows.
 */
export { DocumentRepository } from "./document_repository.js";
export { WorkspaceRepository } from "./workspace_repository.js";
export { DocumentVersionRepository } from "./document_version_repository.js";
