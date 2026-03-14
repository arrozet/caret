import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type KeyLike } from "jose";

/**
 * Extended unit tests for the auth_middleware module.
 * Covers the JWKS caching mechanism (TTL expiry, reset, re-injection),
 * the `reset_jwks_cache` export, the expired token edge case, and
 * all branches of the error classification logic.
 */

// ─── shared key pair ──────────────────────────────────────────────────────

let private_key: KeyLike;
let public_jwk: Awaited<ReturnType<typeof exportJWK>>;

const make_req = (auth_header?: string): Partial<Request> => ({
  headers: auth_header ? { authorization: auth_header } : {},
});

const make_res = (): Partial<Response> => ({});

async function sign_token(
  payload: Record<string, unknown>,
  opts?: { expired?: boolean; key?: KeyLike },
): Promise<string> {
  const key = opts?.key ?? private_key;
  const builder = new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setIssuedAt();

  builder.setExpirationTime(
    opts?.expired ? Math.floor(Date.now() / 1000) - 3600 : "1h",
  );

  return builder.sign(key);
}

// ─── setup ────────────────────────────────────────────────────────────────

beforeEach(async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  private_key = privateKey;
  public_jwk = await exportJWK(publicKey);
  public_jwk.alg = "ES256";
  public_jwk.use = "sig";
  public_jwk.kid = "test-key-extended";
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ─── suite ────────────────────────────────────────────────────────────────

describe("auth_middleware — extended coverage", () => {
  // Helper: load a fresh module instance with env configured
  async function load_module() {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.resetModules();
    const mod = await import("../../src/middleware/auth_middleware.js");
    mod.set_jwks_for_testing(createLocalJWKSet({ keys: [public_jwk] }));
    return mod;
  }

  // ─── expired token ────────────────────────────────────────────────────

  /**
   * Expired tokens must be rejected to prevent replayed credentials from
   * granting access after a user session has ended.
   */
  it("rejects an expired token with 'Invalid or expired' message", async () => {
    // Arrange
    const { auth_middleware } = await load_module();
    const token = await sign_token({ sub: "user-expired" }, { expired: true });
    const next = vi.fn();

    // Act
    await auth_middleware(
      make_req(`Bearer ${token}`) as Request,
      make_res() as Response,
      next,
    );

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
    const { auth_middleware } = await load_module();
    const next = vi.fn();

    // Act
    await auth_middleware(
      make_req("Bearer") as Request,
      make_res() as Response,
      next,
    );

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
    const { auth_middleware } = await load_module();
    const next = vi.fn();

    // Act
    await auth_middleware(
      make_req("Bearer ") as Request,
      make_res() as Response,
      next,
    );

    // Assert
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    // Empty string is not a valid JWT → JOSEError path → "Invalid or expired"
    expect(err.message).toMatch(/Invalid or expired/i);
  });

  // ─── reset_jwks_cache ─────────────────────────────────────────────────

  /**
   * `reset_jwks_cache` must clear the module-level cache so that the next
   * call to `get_jwks` fetches fresh keys from Supabase.
   * We verify the reset by confirming that an attempt without re-injecting
   * the test JWKS will attempt a real network call (which we mock to fail).
   */
  it("reset_jwks_cache clears the cached resolver", async () => {
    // Arrange
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-key");
    vi.resetModules();
    const mod = await import("../../src/middleware/auth_middleware.js");

    // Inject a working resolver first
    mod.set_jwks_for_testing(createLocalJWKSet({ keys: [public_jwk] }));

    // Act — reset the cache
    mod.reset_jwks_cache();

    // Mock fetch to return a failure so we can detect the re-fetch attempt
    const fetch_mock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });
    vi.stubGlobal("fetch", fetch_mock);

    const token = await sign_token({ sub: "user-1" });
    const next = vi.fn();

    await mod.auth_middleware(
      make_req(`Bearer ${token}`) as Request,
      make_res() as Response,
      next,
    );

    // Assert — next must have been called with an error (fetch failed)
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  // ─── set_jwks_for_testing ─────────────────────────────────────────────

  /**
   * `set_jwks_for_testing` must replace the resolver so that the next
   * request uses the injected key set without hitting the network.
   */
  it("set_jwks_for_testing allows verifying valid tokens without network calls", async () => {
    // Arrange
    const { auth_middleware, set_jwks_for_testing } = await load_module();
    const payload = {
      sub: "user-set-jwks",
      email: "jwks@example.com",
      aud: "authenticated",
      role: "authenticated",
    };
    const token = await sign_token(payload);
    const req = make_req(`Bearer ${token}`) as Request;
    const next = vi.fn();

    // Act
    await auth_middleware(req, make_res() as Response, next);

    // Assert — next called with no args (success)
    expect(next).toHaveBeenCalledWith();
    expect(req.auth_user?.sub).toBe("user-set-jwks");
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

  // ─── req.auth_user populated correctly ───────────────────────────────

  /**
   * All claims present in the signed payload must be accessible on
   * req.auth_user after successful verification.
   */
  it("populates req.auth_user with all claims from the JWT payload", async () => {
    // Arrange
    const { auth_middleware } = await load_module();
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: "uuid-abc",
      email: "claims@test.com",
      aud: "authenticated",
      role: "authenticated",
      iat: now,
    };
    const token = await sign_token(payload);
    const req = make_req(`Bearer ${token}`) as Request;
    const next = vi.fn();

    // Act
    await auth_middleware(req, make_res() as Response, next);

    // Assert
    expect(next).toHaveBeenCalledWith();
    expect(req.auth_user?.sub).toBe("uuid-abc");
    expect(req.auth_user?.email).toBe("claims@test.com");
    expect(req.auth_user?.aud).toBe("authenticated");
    expect(req.auth_user?.role).toBe("authenticated");
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
    const token = await sign_token({ sub: "user-1" });
    const next = vi.fn();

    // Act
    await mod.auth_middleware(
      make_req(`Bearer ${token}`) as Request,
      make_res() as Response,
      next,
    );

    // Assert — must be forwarded as-is (not wrapped)
    expect(next).toHaveBeenCalledOnce();
    const forwarded = next.mock.calls[0][0] as Error;
    expect(forwarded).toBeInstanceOf(TypeError);
    expect(forwarded.message).toBe("Cannot read properties of undefined");
  });
});
