import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

/**
 * Global error handler middleware. Must be registered last in the Express pipeline.
 * Catches all unhandled errors and returns a consistent JSON error response.
 */
export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
}
