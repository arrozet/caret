import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { WorkspaceService } from "../services/workspace_service.js";
import type { CreateWorkspaceDto } from "../dtos/create_workspace_dto.js";
import { validateNonEmptyString, validateUuid, parsePagination } from "../lib/validation.js";

/**
 * Build Express Router for workspace CRUD endpoints.
 * All routes require an authenticated user (auth_middleware applied upstream).
 *
 * Endpoints:
 *   POST   /          — create a workspace
 *   GET    /          — list the caller's workspaces
 *   GET    /:id       — get a single workspace
 *
 * @param workspace_service - Injected WorkspaceService instance.
 * @returns Configured Express Router.
 */
export function createWorkspaceRoutes(workspaceService: WorkspaceService): Router {
  const router = Router();

  /**
   * POST / — Create a new workspace.
   * Body: { name: string, slug?: string }
   */
  router.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateWorkspaceDto;
      validateNonEmptyString(dto.name, "name");
      const userId = req.auth_user!.sub;
      const result = await workspaceService.createWorkspace(dto, userId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET / — List workspaces the authenticated user belongs to.
   * Query: limit (optional), offset (optional).
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.auth_user!.sub;
      const rawLimit = req.query.limit as string | undefined;
      const rawOffset = req.query.offset as string | undefined;
      const pagination = parsePagination(rawLimit, rawOffset);
      const result = await workspaceService.listWorkspaces(userId, pagination);
      /* Backward compatibility: return flat array when no pagination params were sent */
      const wantsPagination = rawLimit !== undefined || rawOffset !== undefined;
      res.json(wantsPagination ? result : result.data);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /:id — Get a single workspace by ID.
   */
  router.get("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      validateUuid(id, "id");
      const userId = req.auth_user!.sub;
      const result = await workspaceService.getWorkspace(id, userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const create_workspace_routes = createWorkspaceRoutes;
