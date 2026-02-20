import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../lib/errors.js";

/**
 * JWT authentication guard.
 * Validates the Bearer token from the Authorization header.
 * Attaches the decoded user payload to req.user on success.
 * Throws UnauthorizedError if the token is missing or invalid.
 */
export async function auth_middleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth_header = req.headers.authorization;
    if (!auth_header?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or malformed Authorization header");
    }
    // JWT validation will be implemented when Supabase Auth is integrated.
    next();
  } catch (err) {
    next(err);
  }
}
