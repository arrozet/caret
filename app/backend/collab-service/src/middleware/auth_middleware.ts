import type { IncomingMessage } from "http";
import { jwtVerify, errors as jose_errors } from "jose";
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

/**
 * Validates a JWT token against the Supabase secret.
 * Verifies signature and expiration automatically via jose library.
 *
 * @param token - Raw JWT string to validate
 * @returns Decoded and verified token payload
 * @throws UnauthorizedError if token is invalid, expired, or malformed
 */
async function validate_jwt(token: string): Promise<TokenPayload> {
  const secret = config.SUPABASE_JWT_SECRET;

  if (!secret) {
    throw new UnauthorizedError("JWT secret not configured");
  }

  const secret_key = new TextEncoder().encode(secret);

  try {
    const { payload } = await jwtVerify(token, secret_key);

    if (!payload.sub || typeof payload.sub !== "string") {
      throw new UnauthorizedError("Invalid token: missing sub claim");
    }

    return {
      sub: payload.sub,
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
      iat: typeof payload.iat === "number" ? payload.iat : undefined,
    };
  } catch (error) {
    if (error instanceof jose_errors.JWTExpired) {
      throw new UnauthorizedError("Token has expired");
    }
    if (error instanceof jose_errors.JWSSignatureVerificationFailed) {
      throw new UnauthorizedError("Invalid token signature");
    }
    if (error instanceof jose_errors.JWSInvalid) {
      throw new UnauthorizedError("Malformed token");
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError("Token validation failed");
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
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
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
