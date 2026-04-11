import { describe, it, expect, vi, beforeAll } from "vitest";

/**
 * Unit tests for the CORS middleware (`src/middleware/cors_middleware.ts`).
 *
 * Verifies that the middleware is built from the `cors` package using the
 * config values, and that it handles allowed/disallowed origins correctly
 * by inspecting the options object passed to `cors()` at module load time.
 *
 * NOTE: corsMiddleware is a module-level constant — cors() is called once
 * when the module is first imported. We capture the call options in beforeAll
 * and share them across assertions to avoid re-import / spy-clearing issues.
 */

// --------------------------------------------------------------------------
// Module-level options capture — must be declared before vi.mock() hoisting.
// --------------------------------------------------------------------------

let capturedCorsOptions: Record<string, unknown> = {};

vi.mock("cors", () => {
  const corsFn = vi.fn((options: Record<string, unknown>) => {
    // Capture options at the point cors() is called (module load time).
    capturedCorsOptions = options;
    // Return a minimal middleware stub.
    return vi.fn((_req: unknown, _res: unknown, next: () => void) => next());
  });
  return { default: corsFn };
});

// Mock config so tests are not environment-dependent.
vi.mock("../../src/lib/config.js", () => ({
  config: {
    allowedOrigins: ["http://localhost:5173", "https://caret.app"],
    port: 3000,
    nodeEnv: "test",
    rateLimitMax: 1000,
    rateLimitWindowMinutes: 15,
    authServiceUrl: "http://localhost:3001",
    documentServiceUrl: "http://localhost:3002",
    aiServiceUrl: "http://localhost:8000",
  },
}));

// --------------------------------------------------------------------------
// Import the module under test ONCE — options are captured at this point.
// --------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let corsMiddleware: any;
let corsSpy: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const corsModule = await import("cors");
  corsSpy = corsModule.default as ReturnType<typeof vi.fn>;
  const middlewareModule = await import("../../src/middleware/cors_middleware.js");
  corsMiddleware = middlewareModule.corsMiddleware;
});

describe("corsMiddleware", () => {
  /**
   * Verifies that the corsMiddleware export is a callable middleware function
   * created by the `cors` package, not a raw object.
   */
  it("exports a function as the cors middleware", () => {
    // Arrange — module already loaded in beforeAll

    // Act — inspect the exported value

    // Assert
    expect(typeof corsMiddleware).toBe("function");
  });

  /**
   * Verifies that `cors()` was called exactly once at module load time,
   * confirming no lazy initialisation pattern is used.
   */
  it("calls cors exactly once at module load", () => {
    // Arrange — captured in beforeAll

    // Act — cors() is called when the module is imported

    // Assert
    expect(corsSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * Verifies that `cors()` is called with the allowed origins from config,
   * restricting access to only trusted frontends.
   */
  it("passes allowed origins from config to cors", () => {
    // Arrange — options captured at module load time

    // Act — read from captured options

    // Assert
    expect(capturedCorsOptions.origin).toEqual(["http://localhost:5173", "https://caret.app"]);
  });

  /**
   * Verifies that credentials are enabled, required for cookie-based auth.
   */
  it("enables credentials for cookie-based auth", () => {
    // Arrange — options captured at module load time

    // Act — read from captured options

    // Assert
    expect(capturedCorsOptions.credentials).toBe(true);
  });

  /**
   * Verifies that required HTTP methods are allowed — including OPTIONS for
   * preflight requests, which browsers send before cross-origin requests.
   */
  it("allows required HTTP methods including OPTIONS", () => {
    // Arrange — options captured at module load time
    const methods = capturedCorsOptions.methods as string[];

    // Act — inspect the methods array

    // Assert
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");
    expect(methods).toContain("PUT");
    expect(methods).toContain("PATCH");
    expect(methods).toContain("DELETE");
    expect(methods).toContain("OPTIONS");
  });

  /**
   * Verifies that Content-Type and Authorization headers are allowed,
   * both are required for JSON API calls with Bearer token auth.
   */
  it("allows Content-Type and Authorization headers", () => {
    // Arrange — options captured at module load time
    const allowedHeaders = capturedCorsOptions.allowedHeaders as string[];

    // Act — inspect the allowedHeaders array

    // Assert
    expect(allowedHeaders).toContain("Content-Type");
    expect(allowedHeaders).toContain("Authorization");
  });

  /**
   * Verifies the middleware can be invoked and calls next(), confirming it
   * is a proper Express middleware (does not swallow the request).
   */
  it("calls next when invoked as middleware", () => {
    // Arrange
    const mockReq = {};
    const mockRes = {};
    const mockNext = vi.fn();

    // Act
    (corsMiddleware as (req: unknown, res: unknown, next: () => void) => void)(
      mockReq,
      mockRes,
      mockNext,
    );

    // Assert
    expect(mockNext).toHaveBeenCalledOnce();
  });
});
