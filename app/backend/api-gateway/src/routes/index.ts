import type { Express } from "express";

/**
 * Registers all proxy routes on the Express app.
 * Each route forwards requests to the corresponding downstream microservice.
 * The frontend always calls the Gateway; it never contacts services directly.
 *
 * Route map:
 *   /api/v1/auth/*         → auth-service
 *   /api/v1/documents/*    → document-service
 *   /api/v1/ai/*           → ai-service
 */
export function register_routes(app: Express): void {
  // Routes will be registered here as each service is implemented.
}
