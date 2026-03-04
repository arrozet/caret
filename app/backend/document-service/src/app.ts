import express from "express";
import { error_middleware } from "./middleware/error_middleware.js";
import { auth_middleware } from "./middleware/auth_middleware.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { db } from "./db/client.js";
import { DocumentRepository } from "./repositories/document_repository.js";
import { WorkspaceRepository } from "./repositories/workspace_repository.js";
import { DocumentVersionRepository } from "./repositories/document_version_repository.js";
import { DocumentService } from "./services/document_service.js";
import { WorkspaceService } from "./services/workspace_service.js";
import { FolderService } from "./services/folder_service.js";
import { FolderRepository } from "./repositories/folder_repository.js";
import { create_document_routes } from "./routes/document_routes.js";
import { create_workspace_routes } from "./routes/workspace_routes.js";
import { create_folder_routes } from "./routes/folder_routes.js";

/**
 * Express app entry point for the Document Service.
 * Instantiates repositories, services, and wires routes with DI.
 */
const app = express();

app.use(express.json());

/* ============================================================
   Dependency Injection — manual wiring (no DI container)
   ============================================================ */

const document_repo = new DocumentRepository(db);
const workspace_repo = new WorkspaceRepository(db);
const version_repo = new DocumentVersionRepository(db);
const folder_repo = new FolderRepository(db);

const document_service = new DocumentService(
  document_repo,
  version_repo,
  workspace_repo,
);
const workspace_service = new WorkspaceService(workspace_repo);
const folder_service = new FolderService(folder_repo, workspace_repo);

/* ============================================================
   Routes
   ============================================================ */

/** Health check — unauthenticated. */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "document-service" });
});

/** Protected API routes — auth_middleware validates JWT first. */
app.use("/documents", auth_middleware, create_document_routes(document_service));
app.use(
  "/workspaces",
  auth_middleware,
  create_workspace_routes(workspace_service),
);
app.use("/folders", auth_middleware, create_folder_routes(folder_service));

/** Global error handler — must be last. */
app.use(error_middleware);

app.listen(config.PORT, () => {
  logger.info(`Document Service running on port ${config.PORT}`);
});

export default app;
