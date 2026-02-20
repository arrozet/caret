/**
 * Repositories for the Document Service.
 * Encapsulates all Drizzle ORM queries for: DocumentRepository, FolderRepository, WorkspaceRepository.
 * Receive the db client via constructor injection (DI).
 *
 * Rule: all SQL/ORM logic lives here — never in Services.
 * Rule: accept and return domain Models, never DTOs or raw ORM rows.
 */
export {};
