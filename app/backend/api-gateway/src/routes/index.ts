import type { Express, Request, Response } from "express";
import proxy from "express-http-proxy";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

/**
 * Create a proxy middleware that forwards requests to a downstream service.
 * Strips only the `/api/v1` prefix so the downstream service receives
 * its own mount path (e.g., `/api/v1/documents/123` → `/documents/123`).
 */
function create_proxy(target_url: string): ReturnType<typeof proxy> {
  return proxy(target_url, {
    proxyReqPathResolver(req: Request): string {
      const downstream_path = req.originalUrl.replace("/api/v1", "") || "/";
      logger.info(`Proxying ${req.method} ${req.originalUrl} → ${target_url}${downstream_path}`);
      return downstream_path;
    },
    proxyErrorHandler(err, _res, next) {
      logger.error(`Proxy error: ${err.message}`);
      next(err);
    },
  });
}

/**
 * Register all proxy routes on the Express app.
 *
 * Each route forwards requests to the corresponding downstream microservice.
 * The frontend always calls the Gateway; it never contacts services directly.
 *
 * Route map:
 *   /api/v1/auth/*         → auth-service     (port 3001)
 *   /api/v1/documents/*    → document-service (port 3002)
 *   /api/v1/workspaces/*   → document-service (port 3002)
 *   /api/v1/folders/*      → document-service (port 3002)
 *   /api/v1/ai/*           → ai-service       (port 8000)
 */
export function register_routes(app: Express): void {
  /* --- Auth Service --- */
  app.use("/api/v1/auth", create_proxy(config.AUTH_SERVICE_URL));

  /* --- Document Service --- */
  app.use("/api/v1/documents", create_proxy(config.DOCUMENT_SERVICE_URL));

  /* --- Workspaces (handled by document-service) --- */
  app.use("/api/v1/workspaces", create_proxy(config.DOCUMENT_SERVICE_URL));

  /* --- Folders (handled by document-service) --- */
  app.use("/api/v1/folders", create_proxy(config.DOCUMENT_SERVICE_URL));

  /* --- AI Service --- */
  app.use("/api/v1/ai", create_proxy(config.AI_SERVICE_URL));

  /* --- API info endpoint --- */
  app.get("/api/v1", (_req: Request, res: Response) => {
    res.json({
      service: "caret-api-gateway",
      version: "v1",
      endpoints: [
        "/api/v1/auth",
        "/api/v1/documents",
        "/api/v1/workspaces",
        "/api/v1/folders",
        "/api/v1/ai",
      ],
    });
  });
}
