import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/**
 * PostgreSQL unique constraint violation error code (23505).
 */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Global error handler. Must be the last middleware registered in app.ts.
 * Maps AppError subclasses to their corresponding HTTP status codes.
 * PostgreSQL unique violations (23505) are mapped to 409 Conflict.
 * All unknown errors return 500.
 */
export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (isUniqueViolation(err)) {
    const message = formatUniqueViolationMessage(err);
    res.status(409).json({ error: message });
    return;
  }

  logger.error("Unhandled error", { message: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
}

/**
 * Check whether a thrown error is a Postgres unique constraint violation (code 23505).
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === PG_UNIQUE_VIOLATION
  );
}

/**
 * Produce a human-friendly message from a unique violation error.
 */
function formatUniqueViolationMessage(err: {
  detail?: string;
  constraint?: string;
  message?: string;
}): string {
  if (
    err.constraint === "uq_folders_name_per_parent" ||
    err.constraint === "uq_folders_name_root"
  ) {
    return "A folder with this name already exists in this location.";
  }
  if (err.constraint === "uq_documents_title_per_folder") {
    return "A document with this title already exists in this location.";
  }
  return "This name already exists. Please choose a different one.";
}

export const error_middleware = errorMiddleware;
