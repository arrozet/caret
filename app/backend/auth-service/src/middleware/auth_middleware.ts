import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../lib/errors.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

/**
 * Shape of the decoded Supabase JWT payload.
 * Supabase JWTs follow the standard claims plus custom fields.
 */
interface SupabaseJwtPayload {
  /** Subject — the Supabase user ID (UUID). */
  sub: string;
  /** Email address from Supabase Auth. */
  email?: string;
  /** Token audience (typically "authenticated"). */
  aud: string;
  /** Role assigned by Supabase (e.g., "authenticated"). */
  role: string;
  /** Issued-at timestamp (seconds since epoch). */
  iat: number;
  /** Expiration timestamp (seconds since epoch). */
  exp: number;
}

/**
 * Extend the Express Request type to include the authenticated user payload.
 * This augmentation is available throughout the auth-service codebase.
 */
declare global {
  namespace Express {
    interface Request {
      /** Decoded JWT payload attached by auth_middleware. */
      auth_user?: SupabaseJwtPayload;
    }
  }
}

/**
 * JWT authentication guard.
 *
 * Validates the Bearer token from the Authorization header using
 * the Supabase JWT secret. On success, attaches the decoded payload
 * to `req.auth_user` for downstream handlers.
 *
 * Throws UnauthorizedError if the token is missing, malformed, or invalid.
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

    const token = auth_header.slice(7); /* Strip "Bearer " prefix */

    if (!config.JWT_SECRET) {
      logger.error("JWT_SECRET is not configured — cannot validate tokens");
      throw new UnauthorizedError("Authentication is not configured");
    }

    const decoded = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as SupabaseJwtPayload;

    /* Validate required claims */
    if (!decoded.sub) {
      throw new UnauthorizedError("Token missing subject claim");
    }

    req.auth_user = decoded;
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError("Invalid or expired token"));
      return;
    }

    next(err);
  }
}
