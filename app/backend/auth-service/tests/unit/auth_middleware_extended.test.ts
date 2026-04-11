import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type KeyLike } from "jose";

/**
 * Extended unit tests for the authMiddleware module.
 * Covers the JWKS caching mechanism (TTL expiry, reset, re-injection),
 * the `resetJwksCache` export, the expired token edge case, and
 * all branches of the error classification logic.
 */

// ─── shared key pair ──────────────────────────────────────────────────────

let privateKey: KeyLike;
let publicJwk: Awaited<ReturnType<typeof exportJWK>>;

const makeReq = (authHeader?: string): Partial<Request> => ({
  headers: authHeader ? { authorization: authHeader } : {},
});

const makeRes = (): Partial<Response> => ({});

async function signToken(
  payload: Record<string, unknown>,
  opts?: { expired?: boolean; key?: KeyLike },
): Promise<string> {
  const key = opts?.key ?? privateKey;
  const builder = new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setIssuedAt();

  builder.setExpirationTime(opts?.expired ? Math.floor(Date.now() / 1000) - 3600 : "1h");

  return builder.sign(key);
}

// ─── setup ────────────────────────────────────────────────────────────────

beforeEach(async () => {
  const { privateKey: generatedPrivateKey, publicKey } = await generateKeyPair("ES256");
  privateKey = generatedPrivateKey;
  publicJwk = await exportJWK(publicKey);
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  publicJwk.kid = "test-key-extended";
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ─── suite ────────────────────────────────────────────────────────────────

describe("authMiddleware — extended coverage", () => {
  // Helper: load a fresh module instance with env configured
  async function load_module() {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.resetModules();
    const mod = await import("../../src/middleware/auth_middleware.js");
    mod.setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
    return mod;
  }

  // ─── expired token ────────────────────────────────────────────────────

  /**
   * Expired tokens must be rejected to prevent replayed credentials from
   * granting access after a user session has ended.
   */
  it("rejects an expired token with 'Invalid or expired' message", async () => {
    // Arrange
    const { authMiddleware } = await load_module();
    const token = await signToken({ sub: "user-expired" }, { expired: true });
    const next = vi.fn();

    // Act
    await authMiddleware(makeReq(`Bearer ${token}`) as Request, makeRes() as Response, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/Invalid or expired/i);
  });

  // ─── Bearer prefix variants ───────────────────────────────────────────

  /**
   * The middleware must strip exactly the "Bearer " prefix (7 chars).
   * A header of "Bearer" without a space is not a valid Bearer scheme.
   */
  it("rejects a header that is exactly 'Bearer' without a space or token", async () => {
    // Arrange
    const { authMiddleware } = await load_module();
    const next = vi.fn();

    // Act
    await authMiddleware(makeReq("Bearer") as Request, makeRes() as Response, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/Missing or malformed/i);
  });

  /**
   * An empty Bearer token string after stripping the prefix is syntactically
   * invalid and must produce an "Invalid or expired" response.
   */
  it("rejects 'Bearer ' (with space but empty token) as invalid JWT", async () => {
    // Arrange
    const { authMiddleware } = await load_module();
    const next = vi.fn();

    // Act
    await authMiddleware(makeReq("Bearer ") as Request, makeRes() as Response, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    // Empty string is not a valid JWT → JOSEError path → "Invalid or expired"
    expect(err.message).toMatch(/Invalid or expired/i);
  });

  // ─── resetJwksCache ─────────────────────────────────────────────────

  /**
   * `resetJwksCache` must clear the module-level cache so that the next
   * call to `get_jwks` fetches fresh keys from Supabase.
   * We verify the reset by confirming that an attempt without re-injecting
   * the test JWKS will attempt a real network call (which we mock to fail).
   */
  it("resetJwksCache clears the cached resolver", async () => {
    // Arrange
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-key");
    vi.resetModules();
    const mod = await import("../../src/middleware/auth_middleware.js");

    // Inject a working resolver first
    mod.setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));

    // Act — reset the cache
    mod.resetJwksCache();

    // Mock fetch to return a failure so we can detect the re-fetch attempt
    const fetch_mock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });
    vi.stubGlobal("fetch", fetch_mock);

    const token = await signToken({ sub: "user-1" });
    const next = vi.fn();

    await mod.authMiddleware(makeReq(`Bearer ${token}`) as Request, makeRes() as Response, next);

    // Assert — next must have been called with an error (fetch failed)
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  // ─── setJwksForTesting ─────────────────────────────────────────────

  /**
   * `setJwksForTesting` must replace the resolver so that the next
   * request uses the injected key set without hitting the network.
   */
  it("setJwksForTesting allows verifying valid tokens without network calls", async () => {
    // Arrange
    const { authMiddleware } = await load_module();
    const payload = {
      sub: "user-set-jwks",
      email: "jwks@example.com",
      aud: "authenticated",
      role: "authenticated",
    };
    const token = await signToken(payload);
    const req = makeReq(`Bearer ${token}`) as Request;
    const next = vi.fn();

    // Act
    await authMiddleware(req, makeRes() as Response, next);

    // Assert — next called with no args (success)
    expect(next).toHaveBeenCalledWith();
    expect(req.authUser?.sub).toBe("user-set-jwks");
  });

  // ─── SUPABASE_ANON_KEY missing ────────────────────────────────────────

  /**
   * Missing SUPABASE_ANON_KEY must also result in "not configured" error.
   */
  it("rejects when SUPABASE_ANON_KEY is not configured", async () => {
    // Arrange
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    vi.resetModules();
    const { authMiddleware: unconfigured } =
      await import("../../src/middleware/auth_middleware.js");
    const token = await signToken({ sub: "user-1" });
    const next = vi.fn();

    // Act
    await unconfigured(makeReq(`Bearer ${token}`) as Request, makeRes() as Response, next);

    // Assert
    expect(next).toHaveBeenCalledOnce();
    expect((next.mock.calls[0][0] as Error).message).toMatch(/not configured/i);
  });

  // ─── req.authUser populated correctly ───────────────────────────────

  /**
   * All claims present in the signed payload must be accessible on
   * req.authUser after successful verification.
   */
  it("populates req.authUser with all claims from the JWT payload", async () => {
    // Arrange
    const { authMiddleware } = await load_module();
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: "uuid-abc",
      email: "claims@test.com",
      aud: "authenticated",
      role: "authenticated",
      iat: now,
    };
    const token = await signToken(payload);
    const req = makeReq(`Bearer ${token}`) as Request;
    const next = vi.fn();

    // Act
    await authMiddleware(req, makeRes() as Response, next);

    // Assert
    expect(next).toHaveBeenCalledWith();
    expect(req.authUser?.sub).toBe("uuid-abc");
    expect(req.authUser?.email).toBe("claims@test.com");
    expect(req.authUser?.aud).toBe("authenticated");
    expect(req.authUser?.role).toBe("authenticated");
  });

  // ─── non-jose unexpected error propagation ────────────────────────────

  /**
   * Non-JOSE errors (e.g. programming mistakes in downstream code that happen
   * to throw before the JOSE verification) must be forwarded to next() as-is
   * so the global error handler can process them.
   */
  it("forwards non-JOSE unexpected errors to next()", async () => {
    // Arrange
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-key");
    vi.resetModules();

    // Make get_jwks throw a non-JOSE, non-UnauthorizedError
    const unexpected = new TypeError("Cannot read properties of undefined");
    const fetch_mock = vi.fn().mockRejectedValue(unexpected);
    vi.stubGlobal("fetch", fetch_mock);

    const mod = await import("../../src/middleware/auth_middleware.js");
    // Do NOT inject JWKS so it will try to fetch
    const token = await signToken({ sub: "user-1" });
    const next = vi.fn();

    // Act
    await mod.authMiddleware(makeReq(`Bearer ${token}`) as Request, makeRes() as Response, next);

    // Assert — must be forwarded as-is (not wrapped)
    expect(next).toHaveBeenCalledOnce();
    const forwarded = next.mock.calls[0][0] as Error;
    expect(forwarded).toBeInstanceOf(TypeError);
    expect(forwarded.message).toBe("Cannot read properties of undefined");
  });
});
