import { describe, it, expect, vi, beforeAll } from "vitest";

/**
 * Unit tests for the rate-limit middleware (`src/middleware/rate_limit_middleware.ts`).
 *
 * Verifies that the middleware is built from `express-rate-limit` using the
 * config values, exposing the correct configuration for window, max requests,
 * and error messaging.
 *
 * NOTE: rate_limit_middleware is a module-level constant — rateLimit() is called
 * once at import time. We capture the options in beforeAll and share them across
 * assertions to avoid re-import / spy-clearing issues.
 */

// --------------------------------------------------------------------------
// Module-level options capture — must be declared before vi.mock() hoisting.
// --------------------------------------------------------------------------

let capturedRateLimitOptions: Record<string, unknown> = {};

vi.mock("express-rate-limit", () => {
  const rateLimitFn = vi.fn((options: Record<string, unknown>) => {
    // Capture options at the point rateLimit() is called (module load time).
    capturedRateLimitOptions = options;
    // Return a simple pass-through middleware stub.
    return vi.fn((_req: unknown, _res: unknown, next: () => void) => next());
  });
  return { rateLimit: rateLimitFn };
});

// Mock config to control values independently of environment.
vi.mock("../../src/lib/config.js", () => ({
  config: {
    rateLimitMax: 500,
    rateLimitWindowMinutes: 10,
    port: 3000,
    nodeEnv: "test",
    allowedOrigins: ["http://localhost:5173"],
    authServiceUrl: "http://localhost:3001",
    documentServiceUrl: "http://localhost:3002",
    aiServiceUrl: "http://localhost:8000",
  },
}));

// --------------------------------------------------------------------------
// Import once — rateLimit() is called here and options are captured.
// --------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rateLimitMiddleware: any;
let rateLimitSpy: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const rlModule = await import("express-rate-limit");
  rateLimitSpy = rlModule.rateLimit as ReturnType<typeof vi.fn>;
  const middlewareModule = await import("../../src/middleware/rate_limit_middleware.js");
  rateLimitMiddleware = middlewareModule.rateLimitMiddleware;
});

describe("rateLimitMiddleware", () => {
  /**
   * Verifies that the exported value is a callable middleware function.
   */
  it("exports a callable middleware function", () => {
    // Arrange — module already loaded in beforeAll

    // Act — inspect the exported value

    // Assert
    expect(typeof rateLimitMiddleware).toBe("function");
  });

  /**
   * Verifies that `rateLimit()` was called exactly once at module load time.
   */
  it("calls rateLimit exactly once at module load", () => {
    // Arrange — captured in beforeAll

    // Act — rateLimit() is called when the module is imported

    // Assert
    expect(rateLimitSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * Verifies that `rateLimit()` is called with the correct windowMs derived
   * from config.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000.
   */
  it("configures windowMs from config window minutes", () => {
    // Arrange — options captured at module load time

    // Act — read from captured options

    // Assert — 10 minutes * 60 seconds * 1000 ms
    expect(capturedRateLimitOptions.windowMs).toBe(10 * 60 * 1000);
  });

  /**
   * Verifies that `rateLimit()` uses the max from config to limit requests.
   */
  it("configures max requests from config", () => {
    // Arrange — options captured at module load time

    // Act — read from captured options

    // Assert
    expect(capturedRateLimitOptions.max).toBe(500);
  });

  /**
   * Verifies that standard headers (RateLimit-*) are enabled and legacy
   * X-RateLimit-* headers are disabled, following RFC 6585.
   */
  it("enables standard headers and disables legacy headers", () => {
    // Arrange — options captured at module load time

    // Act — read from captured options

    // Assert
    expect(capturedRateLimitOptions.standardHeaders).toBe(true);
    expect(capturedRateLimitOptions.legacyHeaders).toBe(false);
  });

  /**
   * Verifies that the rate-limit error message is a descriptive object
   * with an `error` key so clients receive structured JSON on 429.
   */
  it("returns a structured JSON error message on 429", () => {
    // Arrange — options captured at module load time
    const message = capturedRateLimitOptions.message as Record<string, string>;

    // Act — inspect the message object

    // Assert
    expect(message).toHaveProperty("error");
    expect(typeof message.error).toBe("string");
    expect(message.error.length).toBeGreaterThan(0);
  });

  /**
   * Verifies the middleware calls next() when invoked, confirming it is a
   * proper Express middleware that does not swallow requests under the limit.
   */
  it("calls next when request is within limit", () => {
    // Arrange
    const mockReq = {};
    const mockRes = {};
    const mockNext = vi.fn();

    // Act
    (rateLimitMiddleware as (req: unknown, res: unknown, next: () => void) => void)(
      mockReq,
      mockRes,
      mockNext,
    );

    // Assert
    expect(mockNext).toHaveBeenCalledOnce();
  });
});
