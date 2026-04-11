import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { FolderService } from "../services/folder_service.js";
import type { CreateFolderDto } from "../dtos/create_folder_dto.js";
import type { UpdateFolderDto } from "../dtos/update_folder_dto.js";
import { ValidationError } from "../lib/errors.js";
import {
  validateUuid,
  validateNonEmptyString,
  validateOptionalUuid,
  parsePagination,
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
export function createFolderRoutes(folderService: FolderService): Router {
  const router = Router();

  /**
   * POST / — Create a new folder.
   * Body: { workspace_id: string, name: string, parent_folder_id?: string, sort_order?: number }
   */
  router.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateFolderDto;
      validateNonEmptyString(dto.name, "name");
      validateNonEmptyString(dto.workspace_id, "workspace_id");
      validateUuid(dto.workspace_id, "workspace_id");
      validateOptionalUuid(dto.parent_folder_id, "parent_folder_id");
      const userId = req.auth_user!.sub;
      const result = await folderService.createFolder(dto, userId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET / — List folders in a workspace, optionally by parent.
   * Query: workspace_id (required), parent_folder_id (optional), limit (optional), offset (optional).
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workspaceId = req.query.workspace_id as string | undefined;
      if (!workspaceId) {
        throw new ValidationError("workspace_id query parameter is required");
      }
      validateUuid(workspaceId, "workspace_id");
      const parentFolderId = (req.query.parent_folder_id as string | undefined) ?? null;
      if (parentFolderId !== null) {
        validateUuid(parentFolderId, "parent_folder_id");
      }
      const rawLimit = req.query.limit as string | undefined;
      const rawOffset = req.query.offset as string | undefined;
      const pagination = parsePagination(rawLimit, rawOffset);
      const userId = req.auth_user!.sub;
      const result = await folderService.listFolders(
        workspaceId,
        userId,
        parentFolderId,
        pagination,
      );
      /* Backward compatibility: return flat array when no pagination params were sent */
      const wantsPagination = rawLimit !== undefined || rawOffset !== undefined;
      res.json(wantsPagination ? result : result.data);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /all — List all folders in a workspace (flat list for tree building).
   * Query: workspace_id (required), limit (optional), offset (optional).
   */
  router.get("/all", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
      const result = await folderService.listAllFolders(workspaceId, userId, pagination);
      /* Backward compatibility: return flat array when no pagination params were sent */
      const wantsPagination = rawLimit !== undefined || rawOffset !== undefined;
      res.json(wantsPagination ? result : result.data);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /:id — Get a single folder by ID.
   */
  router.get("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.auth_user!.sub;
      const id = req.params.id as string;
      validateUuid(id, "id");
      const result = await folderService.getFolder(id, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /:id — Update a folder (name, parent_folder_id, sort_order).
   */
  router.patch("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      validateUuid(id, "id");
      const dto = req.body as UpdateFolderDto;
      /* name is optional on update, but if provided must be non-empty */
      if (dto.name !== undefined) {
        validateNonEmptyString(dto.name, "name");
      }
      validateOptionalUuid(dto.parent_folder_id, "parent_folder_id");
      const userId = req.auth_user!.sub;
      const result = await folderService.updateFolder(id, dto, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /:id — Soft-delete a folder.
   */
  router.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      validateUuid(id, "id");
      const userId = req.auth_user!.sub;
      await folderService.deleteFolder(id, userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const create_folder_routes = createFolderRoutes;
