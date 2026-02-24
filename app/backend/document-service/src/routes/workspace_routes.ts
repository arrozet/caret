import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { WorkspaceService } from "../services/workspace_service.js";
import type { CreateWorkspaceDto } from "../dtos/create_workspace_dto.js";
import { validate_non_empty_string, validate_uuid, parse_pagination } from "../lib/validation.js";

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
export function create_workspace_routes(
  workspace_service: WorkspaceService,
): Router {
  const router = Router();

  /**
   * POST / — Create a new workspace.
   * Body: { name: string, slug?: string }
   */
  router.post(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const dto = req.body as CreateWorkspaceDto;
        validate_non_empty_string(dto.name, "name");
        const user_id = req.auth_user!.sub;
        const result = await workspace_service.create_workspace(dto, user_id);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  /**
   * GET / — List workspaces the authenticated user belongs to.
   * Query: limit (optional), offset (optional).
   */
  router.get(
    "/",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user_id = req.auth_user!.sub;
        const pagination = parse_pagination(
          req.query.limit as string | undefined,
          req.query.offset as string | undefined,
        );
        const result = await workspace_service.list_workspaces(
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
   * GET /:id — Get a single workspace by ID.
   */
  router.get(
    "/:id",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const id = req.params.id as string;
        validate_uuid(id, "id");
        const user_id = req.auth_user!.sub;
        const result = await workspace_service.get_workspace(id, user_id);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
