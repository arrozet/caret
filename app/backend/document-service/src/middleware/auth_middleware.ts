import type { Request, Response, NextFunction } from "express";
import { createLocalJWKSet, jwtVerify, errors as jose_errors } from "jose";
import type { JSONWebKeySet, FlattenedJWSInput, JWSHeaderParameters } from "jose";
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

declare module "express-serve-static-core" {
  interface Request {
    /** Decoded JWT payload attached by authMiddleware. */
    authUser?: SupabaseJwtPayload;
    auth_user?: SupabaseJwtPayload;
  }
}

/** Type alias for the key resolver function returned by createLocalJWKSet. */
type JwksResolver = (
  protectedHeader?: JWSHeaderParameters,
  token?: FlattenedJWSInput,
) => Promise<
  ReturnType<typeof import("jose").createLocalJWKSet> extends (...args: never[]) => infer R
    ? Awaited<R>
    : never
>;

/** Cached JWKS resolver and the timestamp (ms) when it was fetched. */
let cachedJwks: { resolver: JwksResolver; fetchedAt: number } | null = null;

/** How long to cache the JWKS before refetching (5 minutes). */
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fetch the JWKS from Supabase's GoTrue endpoint.
 *
 * Supabase requires the `apikey` header on all GoTrue endpoints,
 * including `/auth/v1/.well-known/jwks.json`.  `createRemoteJWKSet` from jose cannot
 * send custom headers, so we fetch manually and use `createLocalJWKSet`.
 */
async function fetchJwks(): Promise<JSONWebKeySet> {
  const base = config.SUPABASE_URL.replace(/\/+$/, "");
  const url = `${base}/auth/v1/.well-known/jwks.json`;

  const response = await fetch(url, {
    headers: {
      apikey: config.SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS from ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<JSONWebKeySet>;
}

/**
 * Get or refresh the cached JWKS resolver.
 * Fetches the key set from Supabase if the cache is empty or stale.
 */
async function getJwks(): Promise<JwksResolver> {
  const now = Date.now();

  if (cachedJwks && now - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.resolver;
  }

  logger.info("[auth] Fetching JWKS from Supabase...");
  const jwksData = await fetchJwks();
  const resolver = createLocalJWKSet(jwksData) as unknown as JwksResolver;
  cachedJwks = { resolver, fetchedAt: now };
  logger.info(`[auth] JWKS loaded — ${jwksData.keys.length} key(s) cached`);

  return resolver;
}

/**
 * Reset the cached JWKS — used by tests to inject a fresh key set.
 */
export function resetJwksCache(): void {
  cachedJwks = null;
}

/**
 * Override the JWKS resolver — used by tests to provide a local key set.
 */
export function setJwksForTesting(testJwks: JwksResolver): void {
  cachedJwks = { resolver: testJwks, fetchedAt: Date.now() };
}

/**
 * JWT authentication guard.
 *
 * Validates the Bearer token from the Authorization header by verifying
 * the signature against Supabase's JWKS (ES256).  On success, attaches
 * the decoded payload to `req.auth_user` for downstream handlers.
 *
 * Throws UnauthorizedError if the token is missing, malformed, or invalid.
 */
export async function authMiddleware(
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

    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
      logger.error("SUPABASE_URL or SUPABASE_ANON_KEY is not configured");
      throw new UnauthorizedError("Authentication is not configured");
    }

    const jwksResolver = await getJwks();

    const { payload } = await jwtVerify(token, jwksResolver, {
      algorithms: ["ES256"],
    });

    const decoded = payload as unknown as SupabaseJwtPayload;

    /* Validate required claims */
    if (!decoded.sub) {
      throw new UnauthorizedError("Token missing subject claim");
    }

    req.authUser = decoded;
    req.auth_user = decoded;
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
      return;
    }

    /* Any jose-related error (invalid signature, expired, malformed, etc.) */
    if (err instanceof jose_errors.JOSEError) {
      logger.warn(`[auth] JOSEError (${err.constructor.name}): ${err.message}`);
      next(new UnauthorizedError("Invalid or expired token"));
      return;
    }

    logger.error(`[auth] Unexpected error: ${(err as Error).message}`);
    next(err);
  }
}

export const auth_middleware = authMiddleware;
export const reset_jwks_cache = resetJwksCache;
export const set_jwks_for_testing = setJwksForTesting;
