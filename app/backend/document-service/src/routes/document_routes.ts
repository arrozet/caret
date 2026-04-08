import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { DocumentService } from "../services/document_service.js";
import type { CreateDocumentDto } from "../dtos/create_document_dto.js";
import type { UpdateDocumentDto } from "../dtos/update_document_dto.js";
import type { InviteWorkspaceMemberDto } from "../dtos/invite_workspace_member_dto.js";
import { ValidationError } from "../lib/errors.js";
import {
  validate_uuid,
  validate_non_empty_string,
  validate_optional_uuid,
  parse_pagination,
  validate_email,
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
export function create_document_routes(document_service: DocumentService): Router {
  const router = Router();

  /**
   * POST / — Create a new document.
   * Body: { title: string, workspace_id: string, folder_id?: string }
   */
  router.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateDocumentDto;
      validate_non_empty_string(dto.title, "title");
      validate_non_empty_string(dto.workspace_id, "workspace_id");
      validate_uuid(dto.workspace_id, "workspace_id");
      validate_optional_uuid(dto.folder_id, "folder_id");
      const user_id = req.auth_user!.sub;
      const result = await document_service.create_document(dto, user_id);
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
      const workspace_id = req.query.workspace_id as string | undefined;
      if (!workspace_id) {
        throw new ValidationError("workspace_id query parameter is required");
      }
      validate_uuid(workspace_id, "workspace_id");
      const raw_limit = req.query.limit as string | undefined;
      const raw_offset = req.query.offset as string | undefined;
      const pagination = parse_pagination(raw_limit, raw_offset);
      const user_id = req.auth_user!.sub;
      const result = await document_service.list_documents(workspace_id, user_id, pagination);
      /* Backward compatibility: return flat array when no pagination params were sent */
      const wants_pagination = raw_limit !== undefined || raw_offset !== undefined;
      res.json(wants_pagination ? result : result.data);
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
      validate_uuid(id, "id");
      const user_id = req.auth_user!.sub;
      const result = await document_service.get_document(id, user_id);
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
      validate_uuid(id, "id");
      const dto = req.body as UpdateDocumentDto;
      /* title is optional on update, but if provided must be non-empty */
      if (dto.title !== undefined) {
        validate_non_empty_string(dto.title, "title");
      }
      const user_id = req.auth_user!.sub;
      const result = await document_service.update_document(id, dto, user_id);
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
      validate_uuid(id, "id");
      const user_id = req.auth_user!.sub;
      await document_service.delete_document(id, user_id);
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
        validate_uuid(id, "id");

        const dto = req.body as InviteWorkspaceMemberDto;
        validate_non_empty_string(dto.email, "email");
        validate_email(dto.email, "email");

        const user_id = req.auth_user!.sub;
        const result = await document_service.invite_document_collaborator(
          id,
          dto.email.trim(),
          user_id,
        );
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
