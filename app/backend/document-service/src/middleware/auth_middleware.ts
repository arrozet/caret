import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, errors as jose_errors } from "jose";
import { UnauthorizedError } from "../lib/errors.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

/**
 * Shape of the decoded Supabase JWT payload.
 * Supabase JWTs follow the standard claims plus custom fields.
 */
export interface SupabaseJwtPayload {
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
 * This augmentation is available throughout the document-service codebase.
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
 * Build the JWKS URL from the Supabase project URL.
 * Supabase exposes its public signing keys at `/auth/v1/jwks`.
 */
function get_jwks_url(): URL {
  const base = config.SUPABASE_URL.replace(/\/+$/, "");
  return new URL(`${base}/auth/v1/jwks`);
}

/**
 * Cached JWKS remote key set.
 * `createRemoteJWKSet` handles caching, rotation, and refetch internally.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Get or create the cached JWKS key set.
 * Lazily initialized to avoid errors when SUPABASE_URL is not yet configured.
 */
function get_jwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(get_jwks_url());
  }
  return jwks;
}

/**
 * Reset the cached JWKS — used by tests to inject a fresh key set.
 */
export function reset_jwks_cache(): void {
  jwks = null;
}

/**
 * Override the JWKS resolver — used by tests to provide a local key set.
 */
export function set_jwks_for_testing(
  test_jwks: ReturnType<typeof createRemoteJWKSet>,
): void {
  jwks = test_jwks;
}

/**
 * JWT authentication guard.
 *
 * Validates the Bearer token from the Authorization header by verifying
 * the signature against Supabase's JWKS endpoint (ES256).  On success,
 * attaches the decoded payload to `req.auth_user` for downstream handlers.
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

    if (!config.SUPABASE_URL) {
      logger.error("SUPABASE_URL is not configured — cannot validate tokens");
      throw new UnauthorizedError("Authentication is not configured");
    }

    const { payload } = await jwtVerify(token, get_jwks(), {
      algorithms: ["ES256"],
    });

    const decoded = payload as unknown as SupabaseJwtPayload;

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

    /* Any jose-related error (invalid signature, expired, malformed, etc.) */
    if (err instanceof jose_errors.JOSEError) {
      next(new UnauthorizedError("Invalid or expired token"));
      return;
    }

    next(err);
  }
}
