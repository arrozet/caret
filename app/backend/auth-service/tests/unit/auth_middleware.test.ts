import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { generateKeyPair, exportJWK, SignJWT, type KeyLike } from "jose";

/**
 * Unit tests for the auth-service JWT authentication middleware
 * (`src/middleware/auth_middleware.ts`).
 *
 * Uses a locally-generated ES256 key pair to sign test tokens and
 * `set_jwks_for_testing` to inject the corresponding public key so no real
 * Supabase network calls are made. Covers: missing/malformed header, invalid
 * token, wrong signing key, missing `sub` claim, missing config, and the
 * happy-path where a valid token populates `req.auth_user`.
 */

// ─── shared key pair (generated once for the suite) ───────────────────────

let private_key: KeyLike;
let public_jwk: ReturnType<typeof exportJWK> extends Promise<infer T> ? T : never;

/** Build a minimal Express Request mock with the given Authorization header. */
function make_req(auth_header?: string): Partial<Request> {
  return { headers: auth_header ? { authorization: auth_header } : {} };
}

/** Build a minimal, unused Express Response mock (required by the signature). */
function make_res(): Partial<Response> {
  return {};
}

/**
 * Sign a JWT with the test ES256 private key.
 * Pass `{ expired: true }` to produce a token whose `exp` is in the past.
 */
async function sign_token(
  payload: Record<string, unknown>,
  options?: { expired?: boolean },
): Promise<string> {
  const builder = new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setIssuedAt();

  builder.setExpirationTime(
    options?.expired ? Math.floor(Date.now() / 1000) - 3600 : "1h",
  );

  return builder.sign(private_key);
}

// ─── setup ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Generate a fresh ES256 key pair once for the entire suite.
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  private_key = privateKey;
  public_jwk = await exportJWK(publicKey);
  public_jwk.alg = "ES256";
  public_jwk.use = "sig";
  public_jwk.kid = "test-key-1";
});

// ─── tests ────────────────────────────────────────────────────────────────

describe("auth_middleware", () => {
  let auth_middleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let set_jwks_for_testing: (jwks: unknown) => void;

  beforeEach(async () => {
    // Stub Supabase env vars and reset the module so the JWKS cache is clean.
    vi.stubEnv("SUPABASE_URL", "https://test-project.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.resetModules();

    const mod = await import("../../src/middleware/auth_middleware.js");
    auth_middleware = mod.auth_middleware;
    set_jwks_for_testing = mod.set_jwks_for_testing;

    // Inject the local JWKS resolver so no HTTP calls are made.
    const { createLocalJWKSet } = await import("jose");
    set_jwks_for_testing(createLocalJWKSet({ keys: [public_jwk] }));
  });

  // ─── missing / malformed Authorization header ─────────────────────────────

  /**
   * Requests without an Authorization header must be rejected so that
   * unauthenticated callers cannot reach protected resources.
   */
  it("rejects requests without an Authorization header", async () => {
    // Arrange
    const next = vi.fn();

    // Act
    await auth_middleware(make_req() as Request, make_res() as Response, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect((next.mock.calls[0][0] as Error).message).toMatch(/Missing or malformed/i);
  });

  it("rejects requests with a non-Bearer auth scheme", async () => {
    // Arrange
    const next = vi.fn();

    // Act
    await auth_middleware(
      make_req("Basic abc123") as Request,
      make_res() as Response,
      next,
    );

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect((next.mock.calls[0][0] as Error).message).toMatch(/Missing or malformed/i);
  });

  // ─── invalid / expired tokens ─────────────────────────────────────────────

  /**
   * Tokens that are syntactically invalid or signed with the wrong key must
   * be rejected to prevent signature bypass attacks.
   */
  it("rejects an invalid (non-JWT) token string", async () => {
    // Arrange
    const next = vi.fn();

    // Act
    await auth_middleware(
      make_req("Bearer not.a.valid.token") as Request,
      make_res() as Response,
      next,
    );

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect((next.mock.calls[0][0] as Error).message).toMatch(/Invalid or expired/i);
  });

  it("rejects a token signed with a different (untrusted) private key", async () => {
    // Arrange — generate a separate key pair (simulates a rogue signer)
    const { privateKey: wrong_key } = await generateKeyPair("ES256");
    const bad_token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(wrong_key);
    const next = vi.fn();

    // Act
    await auth_middleware(
      make_req(`Bearer ${bad_token}`) as Request,
      make_res() as Response,
      next,
    );

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect((next.mock.calls[0][0] as Error).message).toMatch(/Invalid or expired/i);
  });

  // ─── missing required claims ──────────────────────────────────────────────

  /**
   * Tokens lacking a `sub` claim cannot identify the caller and must be
   * rejected before any `req.auth_user` is populated.
   */
  it("rejects a token that is missing the 'sub' claim", async () => {
    // Arrange — sign a token with no subject
    const token = await sign_token({ email: "test@example.com" });
    const next = vi.fn();

    // Act
    await auth_middleware(
      make_req(`Bearer ${token}`) as Request,
      make_res() as Response,
      next,
    );

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect((next.mock.calls[0][0] as Error).message).toMatch(/missing subject/i);
  });

  // ─── missing configuration ────────────────────────────────────────────────

  /**
   * If SUPABASE_URL is not set the middleware cannot fetch JWKS and must
   * fail fast with a clear "not configured" message rather than a cryptic
   * network error.
   */
  it("rejects when SUPABASE_URL is not configured", async () => {
    // Arrange — override env after beforeEach and reload module
    vi.stubEnv("SUPABASE_URL", "");
    vi.resetModules();
    const { auth_middleware: unconfigured } = await import(
      "../../src/middleware/auth_middleware.js"
    );
    const token = await sign_token({ sub: "user-1" });
    const next = vi.fn();

    // Act
    await unconfigured(
      make_req(`Bearer ${token}`) as Request,
      make_res() as Response,
      next,
    );

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect((next.mock.calls[0][0] as Error).message).toMatch(/not configured/i);
  });

  // ─── happy path ───────────────────────────────────────────────────────────

  /**
   * A valid, unexpired token signed with the trusted key must result in
   * `req.auth_user` being populated with the decoded claims and `next()`
   * being called with no arguments.
   */
  it("attaches auth_user to req and calls next() with no args for a valid token", async () => {
    // Arrange
    const payload = {
      sub: "user-123",
      email: "test@example.com",
      aud: "authenticated",
      role: "authenticated",
    };
    const token = await sign_token(payload);
    const req = make_req(`Bearer ${token}`) as Request;
    const next = vi.fn();

    // Act
    await auth_middleware(req, make_res() as Response, next);

    // Assert
    expect(next).toHaveBeenCalledWith(/* no args */);
    expect(req.auth_user).toBeDefined();
    expect(req.auth_user!.sub).toBe("user-123");
    expect(req.auth_user!.email).toBe("test@example.com");
  });
});
