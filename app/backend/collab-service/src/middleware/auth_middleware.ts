import type { IncomingMessage } from "http";
import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  errors as jose_errors,
  type JSONWebKeySet,
} from "jose";
import { config } from "../lib/config.js";
import { UnauthorizedError } from "../lib/errors.js";

/**
 * JWT payload structure from Supabase tokens.
 * Contains standard JWT claims used for authentication.
 */
export interface TokenPayload {
  /** Subject claim - contains the user_id */
  sub: string;
  /** Expiration time (Unix timestamp) */
  exp?: number;
  /** Issued at time (Unix timestamp) */
  iat?: number;
}

/**
 * Result of successful WebSocket authentication.
 * Contains all info needed to establish an authenticated connection.
 */
export interface AuthResult {
  /** User ID extracted from JWT sub claim */
  user_id: string;
  /** Document ID extracted from URL path */
  doc_id: string;
  /** Original JWT token for downstream use */
  token: string;
}

/** Cached JWKS resolver and fetch timestamp (ms). */
let cached_jwks: {
  resolver: ReturnType<typeof createLocalJWKSet>;
  fetched_at: number;
} | null = null;

/** JWKS cache TTL: 5 minutes. */
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Convert jose errors into stable UnauthorizedError messages.
 *
 * @param error - Unknown error thrown by jose
 * @returns UnauthorizedError with normalized message
 */
function normalize_jose_error(error: unknown): UnauthorizedError {
  if (error instanceof jose_errors.JWTExpired) {
    return new UnauthorizedError("Token has expired");
  }
  if (error instanceof jose_errors.JWSSignatureVerificationFailed) {
    return new UnauthorizedError("Invalid token signature");
  }
  if (error instanceof jose_errors.JWSInvalid) {
    return new UnauthorizedError("Malformed token");
  }
  if (error instanceof UnauthorizedError) {
    return error;
  }
  return new UnauthorizedError("Token validation failed");
}

/**
 * Fetch Supabase JWKS from GoTrue endpoint.
 *
 * @returns JWKS payload
 * @throws UnauthorizedError when config is missing or request fails
 */
async function fetch_jwks(): Promise<JSONWebKeySet> {
  const base = config.SUPABASE_URL.replace(/\/+$/, "");
  const anon_key = config.SUPABASE_ANON_KEY;

  if (!base || !anon_key) {
    throw new UnauthorizedError("Authentication is not configured");
  }

  const url = `${base}/auth/v1/.well-known/jwks.json`;
  const response = await fetch(url, {
    headers: {
      apikey: anon_key,
    },
  });

  if (!response.ok) {
    throw new UnauthorizedError("Token validation failed");
  }

  return response.json() as Promise<JSONWebKeySet>;
}

/**
 * Resolve and cache Supabase JWKS for asymmetric JWT verification.
 */
async function get_jwks_resolver(): Promise<ReturnType<typeof createLocalJWKSet>> {
  const now = Date.now();
  if (cached_jwks && now - cached_jwks.fetched_at < JWKS_CACHE_TTL_MS) {
    return cached_jwks.resolver;
  }

  const jwks = await fetch_jwks();
  const resolver = createLocalJWKSet(jwks);
  cached_jwks = {
    resolver,
    fetched_at: now,
  };

  return resolver;
}

/**
 * Validates a JWT token against the Supabase secret.
 * Verifies signature and expiration automatically via jose library.
 *
 * @param token - Raw JWT string to validate
 * @returns Decoded and verified token payload
 * @throws UnauthorizedError if token is invalid, expired, or malformed
 */
async function validate_jwt(token: string): Promise<TokenPayload> {
  let alg: string;

  try {
    const header = decodeProtectedHeader(token);
    alg = header.alg ?? "";
  } catch (error) {
    throw normalize_jose_error(error);
  }

  try {
    let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];

    if (alg === "HS256") {
      const secret = config.SUPABASE_JWT_SECRET;
      if (!secret) {
        throw new UnauthorizedError("JWT secret not configured");
      }
      const secret_key = new TextEncoder().encode(secret);
      ({ payload } = await jwtVerify(token, secret_key, {
        algorithms: ["HS256"],
      }));
    } else {
      const jwks_resolver = await get_jwks_resolver();
      ({ payload } = await jwtVerify(token, jwks_resolver, {
        algorithms: ["ES256", "RS256"],
      }));
    }

    if (!payload.sub || typeof payload.sub !== "string") {
      throw new UnauthorizedError("Invalid token: missing sub claim");
    }

    return {
      sub: payload.sub,
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
      iat: typeof payload.iat === "number" ? payload.iat : undefined,
    };
  } catch (error) {
    throw normalize_jose_error(error);
  }
}

/**
 * Extracts doc_id from WebSocket URL path.
 * Expected format: /document/{doc_id}
 *
 * @param pathname - URL pathname to parse
 * @returns Extracted document ID
 * @throws UnauthorizedError if path format is invalid
 */
function extract_doc_id(pathname: string): string {
  const match = pathname.match(/^\/document\/([^/?]+)/);
  if (!match || !match[1]) {
    throw new UnauthorizedError("Invalid document path");
  }
  return match[1];
}

/**
 * WebSocket JWT authentication guard.
 * Called during the WebSocket handshake before a connection is accepted.
 * Extracts and validates the Supabase JWT from the `token` query parameter:
 *   wss://collab.caret.page/document/{doc_id}?token={supabase_jwt}
 *
 * @param req - Incoming HTTP request from WebSocket upgrade
 * @returns AuthResult with validated user_id, doc_id, and token
 * @throws UnauthorizedError if the token is missing, invalid, or expired.
 *         The WS server must close the connection (code 4001) on error.
 */
export async function validate_ws_token(req: IncomingMessage): Promise<AuthResult> {
  const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const token = url.searchParams.get("token");

  if (!token) {
    throw new UnauthorizedError("Missing token query parameter");
  }

  // Extract doc_id from path
  const doc_id = extract_doc_id(url.pathname);

  // Validate JWT and extract payload
  const payload = await validate_jwt(token);

  return {
    user_id: payload.sub,
    doc_id,
    token,
  };
}
