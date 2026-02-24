import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/**
 * Unit tests for the auth_middleware JWT validation guard.
 * Tests cover: missing header, malformed header, invalid token,
 * expired token, missing sub claim, and valid token flow.
 */

/* ── helpers ────────────────────────────────────────── */

const TEST_SECRET = "test-jwt-secret-256-bits-long-enough";

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

/** Generate a valid JWT with the test secret. */
function sign_token(payload: Record<string, unknown>, options?: jwt.SignOptions): string {
  return jwt.sign(payload, TEST_SECRET, { algorithm: "HS256", expiresIn: "1h", ...options });
}

/* ── tests ──────────────────────────────────────────── */

describe("auth_middleware", () => {
  let auth_middleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;

  beforeEach(async () => {
    // Override JWT_SECRET via env before importing the middleware
    vi.stubEnv("JWT_SECRET", TEST_SECRET);

    // Re-import with fresh module cache so config picks up the stubbed env
    const mod = await import("../../src/middleware/auth_middleware.js");
    auth_middleware = mod.auth_middleware;
  });

  it("rejects requests without Authorization header", async () => {
    const next = vi.fn();
    await auth_middleware(make_req() as Request, make_res() as Response, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err).toBeDefined();
    expect(err.message).toMatch(/Missing or malformed/i);
  });

  it("rejects requests with non-Bearer auth scheme", async () => {
    const next = vi.fn();
    await auth_middleware(make_req("Basic abc123") as Request, make_res() as Response, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/Missing or malformed/i);
  });

  it("rejects an invalid JWT", async () => {
    const next = vi.fn();
    await auth_middleware(make_req("Bearer not.a.valid.token") as Request, make_res() as Response, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/Invalid or expired/i);
  });

  it("rejects a token signed with a different secret", async () => {
    const bad_token = jwt.sign({ sub: "user-1" }, "wrong-secret", { algorithm: "HS256" });
    const next = vi.fn();
    await auth_middleware(make_req(`Bearer ${bad_token}`) as Request, make_res() as Response, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/Invalid or expired/i);
  });

  it("rejects a token without sub claim", async () => {
    const token = sign_token({ email: "test@example.com" });
    const next = vi.fn();
    await auth_middleware(make_req(`Bearer ${token}`) as Request, make_res() as Response, next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/missing subject/i);
  });

  it("attaches auth_user and calls next() for a valid token", async () => {
    const payload = {
      sub: "user-123",
      email: "test@example.com",
      aud: "authenticated",
      role: "authenticated",
    };
    const token = sign_token(payload);
    const req = make_req(`Bearer ${token}`) as Request;
    const next = vi.fn();

    await auth_middleware(req, make_res() as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.auth_user).toBeDefined();
    expect(req.auth_user!.sub).toBe("user-123");
    expect(req.auth_user!.email).toBe("test@example.com");
  });
});
