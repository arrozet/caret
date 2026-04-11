import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { DocumentService } from "../services/document_service.js";
import type { CreateDocumentDto } from "../dtos/create_document_dto.js";
import type { UpdateDocumentDto } from "../dtos/update_document_dto.js";
import type { InviteWorkspaceMemberDto } from "../dtos/invite_workspace_member_dto.js";
import { ValidationError } from "../lib/errors.js";
import {
  validateUuid,
  validateNonEmptyString,
  validateOptionalUuid,
  parsePagination,
  validateEmail,
} from "../lib/validation.js";

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
 *   POST   /:id/invite — invite a collaborator by email
 *
 * @param document_service - Injected DocumentService instance.
 * @returns Configured Express Router.
 */
export function createDocumentRoutes(documentService: DocumentService): Router {
  const router = Router();

  /**
   * POST / — Create a new document.
   * Body: { title: string, workspace_id: string, folder_id?: string }
   */
  router.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateDocumentDto;
      validateNonEmptyString(dto.title, "title");
      validateNonEmptyString(dto.workspace_id, "workspace_id");
      validateUuid(dto.workspace_id, "workspace_id");
      validateOptionalUuid(dto.folder_id, "folder_id");
      const userId = req.auth_user!.sub;
      const result = await documentService.createDocument(dto, userId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET / — List documents for a workspace.
   * Query: workspace_id (required), limit (optional), offset (optional).
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workspaceId = req.query.workspace_id as string | undefined;
      if (!workspaceId) {
        throw new ValidationError("workspace_id query parameter is required");
      }
      validateUuid(workspaceId, "workspace_id");
      const rawLimit = req.query.limit as string | undefined;
      const rawOffset = req.query.offset as string | undefined;
      const pagination = parsePagination(rawLimit, rawOffset);
      const userId = req.auth_user!.sub;
      const result = await documentService.listDocuments(workspaceId, userId, pagination);
      /* Backward compatibility: return flat array when no pagination params were sent */
      const wantsPagination = rawLimit !== undefined || rawOffset !== undefined;
      res.json(wantsPagination ? result : result.data);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /:id — Get a single document by ID.
   */
  router.get("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      validateUuid(id, "id");
      const userId = req.auth_user!.sub;
      const result = await documentService.getDocument(id, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /:id — Update a document (title, content_json, content_text).
   */
  router.patch("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      validateUuid(id, "id");
      const dto = req.body as UpdateDocumentDto;
      /* title is optional on update, but if provided must be non-empty */
      if (dto.title !== undefined) {
        validateNonEmptyString(dto.title, "title");
      }
      const userId = req.auth_user!.sub;
      const result = await documentService.updateDocument(id, dto, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /:id — Soft-delete a document.
   */
  router.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      validateUuid(id, "id");
      const userId = req.auth_user!.sub;
      await documentService.deleteDocument(id, userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /:id/invite — Invite a collaborator by email.
   * Body: { email: string }
   */
  router.post(
    "/:id/invite",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const id = req.params.id as string;
        validateUuid(id, "id");

        const dto = req.body as InviteWorkspaceMemberDto;
        validateNonEmptyString(dto.email, "email");
        validateEmail(dto.email, "email");

        const userId = req.auth_user!.sub;
        const result = await documentService.inviteDocumentCollaborator(
          id,
          dto.email.trim(),
          userId,
        );
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

export const create_document_routes = createDocumentRoutes;
