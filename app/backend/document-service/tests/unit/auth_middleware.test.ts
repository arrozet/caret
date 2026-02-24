import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  type KeyLike,
} from "jose";

/**
 * Unit tests for the document-service auth_middleware JWT validation guard.
 * Uses jose to generate ES256 key pairs and sign test tokens, matching
 * the real Supabase JWKS flow.
 */

/* ── helpers ────────────────────────────────────────── */

let private_key: KeyLike;
let public_jwk: ReturnType<typeof exportJWK> extends Promise<infer T> ? T : never;

/**
 * Build a minimal Express Request mock with the given authorization header.
 */
function make_req(auth_header?: string): Partial<Request> {
  return {
    headers: auth_header ? { authorization: auth_header } : {},
  };
}

/** Build a minimal Express Response mock (unused but required by signature). */
function make_res(): Partial<Response> {
  return {};
}

/**
 * Sign a JWT with the test ES256 private key.
 */
async function sign_token(
  payload: Record<string, unknown>,
  options?: { expired?: boolean },
): Promise<string> {
  const builder = new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setIssuedAt();

  if (options?.expired) {
    /* Already expired 1 hour ago */
    builder.setExpirationTime(Math.floor(Date.now() / 1000) - 3600);
  } else {
    builder.setExpirationTime("1h");
  }

  return builder.sign(private_key);
}

/* ── setup ──────────────────────────────────────────── */

beforeAll(async () => {
  /* Generate a fresh ES256 key pair for testing */
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  private_key = privateKey;
  public_jwk = await exportJWK(publicKey);
  public_jwk.alg = "ES256";
  public_jwk.use = "sig";
  public_jwk.kid = "test-key-1";
});

/* ── tests ──────────────────────────────────────────── */

describe("auth_middleware", () => {
  let auth_middleware: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<void>;

  let set_jwks_for_testing: (jwks: unknown) => void;
  let reset_jwks_cache: () => void;

  beforeEach(async () => {
    vi.stubEnv("SUPABASE_URL", "https://test-project.supabase.co");
    vi.resetModules();

    const mod = await import("../../src/middleware/auth_middleware.js");
    auth_middleware = mod.auth_middleware;
    set_jwks_for_testing = mod.set_jwks_for_testing;
    reset_jwks_cache = mod.reset_jwks_cache;

    /* Inject a local JWKS resolver that uses our test public key */
    const { createLocalJWKSet } = await import("jose");
    const local_jwks = createLocalJWKSet({ keys: [public_jwk] });
    set_jwks_for_testing(local_jwks);
  });

  it("rejects requests without Authorization header", async () => {
    const next = vi.fn();
    await auth_middleware(
      make_req() as Request,
      make_res() as Response,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err).toBeDefined();
    expect(err.message).toMatch(/Missing or malformed/i);
  });

  it("rejects requests with non-Bearer auth scheme", async () => {
    const next = vi.fn();
    await auth_middleware(
      make_req("Basic abc123") as Request,
      make_res() as Response,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/Missing or malformed/i);
  });

  it("rejects an invalid JWT", async () => {
    const next = vi.fn();
    await auth_middleware(
      make_req("Bearer not.a.valid.token") as Request,
      make_res() as Response,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/Invalid or expired/i);
  });

  it("rejects a token signed with a different key", async () => {
    /* Generate a separate key pair (simulates wrong signer) */
    const { privateKey: wrong_key } = await generateKeyPair("ES256");
    const bad_token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(wrong_key);

    const next = vi.fn();
    await auth_middleware(
      make_req(`Bearer ${bad_token}`) as Request,
      make_res() as Response,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/Invalid or expired/i);
  });

  it("rejects a token without sub claim", async () => {
    const token = await sign_token({ email: "test@example.com" });
    const next = vi.fn();
    await auth_middleware(
      make_req(`Bearer ${token}`) as Request,
      make_res() as Response,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/missing subject/i);
  });

  it("rejects when SUPABASE_URL is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.resetModules();

    const mod = await import("../../src/middleware/auth_middleware.js");
    const middleware = mod.auth_middleware;

    const token = await sign_token({ sub: "user-1" });
    const next = vi.fn();
    await middleware(
      make_req(`Bearer ${token}`) as Request,
      make_res() as Response,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/not configured/i);
  });

  it("attaches auth_user and calls next() for a valid token", async () => {
    const payload = {
      sub: "user-123",
      email: "test@example.com",
      aud: "authenticated",
      role: "authenticated",
    };
    const token = await sign_token(payload);
    const req = make_req(`Bearer ${token}`) as Request;
    const next = vi.fn();

    await auth_middleware(req, make_res() as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.auth_user).toBeDefined();
    expect(req.auth_user!.sub).toBe("user-123");
    expect(req.auth_user!.email).toBe("test@example.com");
  });
});
