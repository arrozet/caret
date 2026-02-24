import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { FolderService } from "../services/folder_service.js";
import type { CreateFolderDto } from "../dtos/create_folder_dto.js";
import type { UpdateFolderDto } from "../dtos/update_folder_dto.js";
import { ValidationError } from "../lib/errors.js";
import {
  validate_uuid,
  validate_non_empty_string,
  validate_optional_uuid,
  parse_pagination,
} from "../lib/validation.js";

/**
 * Build Express Router for folder CRUD endpoints.
 * All routes require an authenticated user (auth_middleware applied upstream).
 *
 * Endpoints:
 *   POST   /          — create a folder
 *   GET    /          — list folders by workspace (query: workspace_id, parent_folder_id)
 *   GET    /all       — list all folders in a workspace (flat, for tree building)
 *   GET    /:id       — get a single folder
 *   PATCH  /:id       — update a folder (name, parent, sort_order)
 *   DELETE /:id       — soft-delete a folder
 *
 * @param folder_service - Injected FolderService instance.
 * @returns Configured Express Router.
 */
export function create_folder_routes(folder_service: FolderService): Router {
  const router = Router();

  /**
   * POST / — Create a new folder.
   * Body: { workspace_id: string, name: string, parent_folder_id?: string, sort_order?: number }
   */
  router.post(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const dto = req.body as CreateFolderDto;
        validate_non_empty_string(dto.name, "name");
        validate_non_empty_string(dto.workspace_id, "workspace_id");
        validate_uuid(dto.workspace_id, "workspace_id");
        validate_optional_uuid(dto.parent_folder_id, "parent_folder_id");
        const user_id = req.auth_user!.sub;
        const result = await folder_service.create_folder(dto, user_id);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * GET / — List folders in a workspace, optionally by parent.
   * Query: workspace_id (required), parent_folder_id (optional), limit (optional), offset (optional).
   */
  router.get(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const workspace_id = req.query.workspace_id as string | undefined;
        if (!workspace_id) {
          throw new ValidationError("workspace_id query parameter is required");
        }
        validate_uuid(workspace_id, "workspace_id");
        const parent_folder_id =
          (req.query.parent_folder_id as string | undefined) ?? null;
        if (parent_folder_id !== null) {
          validate_uuid(parent_folder_id, "parent_folder_id");
        }
        const pagination = parse_pagination(
          req.query.limit as string | undefined,
          req.query.offset as string | undefined,
        );
        const user_id = req.auth_user!.sub;
        const result = await folder_service.list_folders(
          workspace_id,
          user_id,
          parent_folder_id,
          pagination,
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * GET /all — List all folders in a workspace (flat list for tree building).
   * Query: workspace_id (required), limit (optional), offset (optional).
   */
  router.get(
    "/all",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const workspace_id = req.query.workspace_id as string | undefined;
        if (!workspace_id) {
          throw new ValidationError("workspace_id query parameter is required");
        }
        validate_uuid(workspace_id, "workspace_id");
        const pagination = parse_pagination(
          req.query.limit as string | undefined,
          req.query.offset as string | undefined,
        );
        const user_id = req.auth_user!.sub;
        const result = await folder_service.list_all_folders(
          workspace_id,
          user_id,
          pagination,
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * GET /:id — Get a single folder by ID.
   */
  router.get(
    "/:id",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user_id = req.auth_user!.sub;
        const id = req.params.id as string;
        validate_uuid(id, "id");
        const result = await folder_service.get_folder(
          id,
          user_id,
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * PATCH /:id — Update a folder (name, parent_folder_id, sort_order).
   */
  router.patch(
    "/:id",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const id = req.params.id as string;
        validate_uuid(id, "id");
        const dto = req.body as UpdateFolderDto;
        /* name is optional on update, but if provided must be non-empty */
        if (dto.name !== undefined) {
          validate_non_empty_string(dto.name, "name");
        }
        validate_optional_uuid(dto.parent_folder_id, "parent_folder_id");
        const user_id = req.auth_user!.sub;
        const result = await folder_service.update_folder(
          id,
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
   * DELETE /:id — Soft-delete a folder.
   */
  router.delete(
    "/:id",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const id = req.params.id as string;
        validate_uuid(id, "id");
        const user_id = req.auth_user!.sub;
        await folder_service.delete_folder(id, user_id);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
