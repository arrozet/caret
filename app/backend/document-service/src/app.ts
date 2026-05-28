import express from "express";
import { errorMiddleware } from "./middleware/error_middleware.js";
import { authMiddleware } from "./middleware/auth_middleware.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { db } from "./db/client.js";
import { DocumentRepository } from "./repositories/document_repository.js";
import { DocumentMemberRepository } from "./repositories/document_member_repository.js";
import { WorkspaceRepository } from "./repositories/workspace_repository.js";
import { DocumentVersionRepository } from "./repositories/document_version_repository.js";
import { DocumentService } from "./services/document_service.js";
import { WorkspaceService } from "./services/workspace_service.js";
import { FolderService } from "./services/folder_service.js";
import { FolderRepository } from "./repositories/folder_repository.js";
import { createDocumentRoutes } from "./routes/document_routes.js";
import { createWorkspaceRoutes } from "./routes/workspace_routes.js";
import { createFolderRoutes } from "./routes/folder_routes.js";
import { registerOpenApiDocs } from "./openapi/openapi_docs.js";
import openApiSpec from "./openapi/swagger.json" with { type: "json" };

/**
 * Express app entry point for the Document Service.
 * Instantiates repositories, services, and wires routes with DI.
 */
const app = express();

app.use(express.json());

/* ============================================================
   Dependency Injection — manual wiring (no DI container)
   ============================================================ */

const documentRepository = new DocumentRepository(db);
const documentMemberRepository = new DocumentMemberRepository(db);
const workspaceRepository = new WorkspaceRepository(db);
const versionRepository = new DocumentVersionRepository(db);
const folderRepository = new FolderRepository(db);

const documentService = new DocumentService(
  documentRepository,
  documentMemberRepository,
  versionRepository,
  workspaceRepository,
);
const workspaceService = new WorkspaceService(workspaceRepository);
const folderService = new FolderService(
  folderRepository,
  workspaceRepository,
  documentRepository,
  documentMemberRepository,
);

/* ============================================================
   Routes
   ============================================================ */

/** Health check — unauthenticated. */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "document-service" });
});

/** OpenAPI JSON and Swagger UI documentation. */
registerOpenApiDocs(app, openApiSpec);

/** Protected API routes — auth_middleware validates JWT first. */
app.use("/documents", authMiddleware, createDocumentRoutes(documentService));
app.use("/workspaces", authMiddleware, createWorkspaceRoutes(workspaceService));
app.use("/folders", authMiddleware, createFolderRoutes(folderService));

/** Global error handler — must be last. */
app.use(errorMiddleware);

app.listen(config.PORT, () => {
  logger.info(`Document Service running on port ${config.PORT}`);
});

export default app;
