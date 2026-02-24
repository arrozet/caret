import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { DocumentService } from "../services/document_service.js";
import type { CreateDocumentDto } from "../dtos/create_document_dto.js";
import type { UpdateDocumentDto } from "../dtos/update_document_dto.js";
import { ValidationError } from "../lib/errors.js";

/**
 * Build Express Router for document CRUD endpoints.
 * All routes require an authenticated user (auth_middleware applied upstream).
 *
 * Endpoints:
 *   POST   /          — create a document
 *   GET    /          — list documents by workspace (query: workspace_id)
 *   GET    /:id       — get a single document
 *   PATCH  /:id       — update a document (title / content)
 *   DELETE /:id       — soft-delete a document
 *
 * @param document_service - Injected DocumentService instance.
 * @returns Configured Express Router.
 */
export function create_document_routes(
  document_service: DocumentService,
): Router {
  const router = Router();

  /**
   * POST / — Create a new document.
   * Body: { title: string, workspace_id: string, folder_id?: string }
   */
  router.post(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const dto = req.body as CreateDocumentDto;
        if (!dto.title || !dto.workspace_id) {
          throw new ValidationError("title and workspace_id are required");
        }
        const user_id = req.auth_user!.sub;
        const result = await document_service.create_document(dto, user_id);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * GET / — List documents for a workspace.
   * Query: workspace_id (required).
   */
  router.get(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const workspace_id = req.query.workspace_id as string | undefined;
        if (!workspace_id) {
          throw new ValidationError("workspace_id query parameter is required");
        }
        const user_id = req.auth_user!.sub;
        const result = await document_service.list_documents(
          workspace_id,
          user_id,
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * GET /:id — Get a single document by ID.
   */
  router.get(
    "/:id",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user_id = req.auth_user!.sub;
        const result = await document_service.get_document(
          req.params.id,
          user_id,
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * PATCH /:id — Update a document (title, content_json, content_text).
   */
  router.patch(
    "/:id",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const dto = req.body as UpdateDocumentDto;
        const user_id = req.auth_user!.sub;
        const result = await document_service.update_document(
          req.params.id,
          dto,
          user_id,
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * DELETE /:id — Soft-delete a document.
   */
  router.delete(
    "/:id",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user_id = req.auth_user!.sub;
        await document_service.delete_document(req.params.id, user_id);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
