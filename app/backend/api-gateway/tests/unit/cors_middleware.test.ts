import { describe, it, expect, vi, beforeAll } from "vitest";

/**
 * Unit tests for the CORS middleware (`src/middleware/cors_middleware.ts`).
 *
 * Verifies that the middleware is built from the `cors` package using the
 * config values, and that it handles allowed/disallowed origins correctly
 * by inspecting the options object passed to `cors()` at module load time.
 *
 * NOTE: cors_middleware is a module-level constant — cors() is called once
 * when the module is first imported. We capture the call options in beforeAll
 * and share them across assertions to avoid re-import / spy-clearing issues.
 */

// --------------------------------------------------------------------------
// Module-level options capture — must be declared before vi.mock() hoisting.
// --------------------------------------------------------------------------

let captured_cors_options: Record<string, unknown> = {};

vi.mock("cors", () => {
  const cors_fn = vi.fn((options: Record<string, unknown>) => {
    // Capture options at the point cors() is called (module load time).
    captured_cors_options = options;
    // Return a minimal middleware stub.
    return vi.fn((_req: unknown, _res: unknown, next: () => void) => next());
  });
  return { default: cors_fn };
});

// Mock config so tests are not environment-dependent.
vi.mock("../../src/lib/config.js", () => ({
  config: {
    ALLOWED_ORIGINS: ["http://localhost:5173", "https://caret.app"],
    PORT: 3000,
    NODE_ENV: "test",
    RATE_LIMIT_MAX: 1000,
    RATE_LIMIT_WINDOW_MINUTES: 15,
    AUTH_SERVICE_URL: "http://localhost:3001",
    DOCUMENT_SERVICE_URL: "http://localhost:3002",
    AI_SERVICE_URL: "http://localhost:8000",
  },
}));

// --------------------------------------------------------------------------
// Import the module under test ONCE — options are captured at this point.
// --------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cors_middleware: any;
let cors_spy: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const cors_module = await import("cors");
  cors_spy = cors_module.default as ReturnType<typeof vi.fn>;
  const middleware_module = await import("../../src/middleware/cors_middleware.js");
  cors_middleware = middleware_module.cors_middleware;
});

describe("cors_middleware", () => {
  /**
   * Verifies that the cors_middleware export is a callable middleware function
   * created by the `cors` package, not a raw object.
   */
  it("should_export_a_function_as_the_cors_middleware", () => {
    // Arrange — module already loaded in beforeAll

    // Act — inspect the exported value

    // Assert
    expect(typeof cors_middleware).toBe("function");
  });

  /**
   * Verifies that `cors()` was called exactly once at module load time,
   * confirming no lazy initialisation pattern is used.
   */
  it("should_call_cors_exactly_once_at_module_load", () => {
    // Arrange — captured in beforeAll

    // Act — cors() is called when the module is imported

    // Assert
    expect(cors_spy).toHaveBeenCalledTimes(1);
  });

  /**
   * Verifies that `cors()` is called with the allowed origins from config,
   * restricting access to only trusted frontends.
   */
  it("should_pass_allowed_origins_from_config_to_cors", () => {
    // Arrange — options captured at module load time

    // Act — read from captured options

    // Assert
    expect(captured_cors_options.origin).toEqual(["http://localhost:5173", "https://caret.app"]);
  });

  /**
   * Verifies that credentials are enabled, required for cookie-based auth.
   */
  it("should_enable_credentials_for_cookie_based_auth", () => {
    // Arrange — options captured at module load time

    // Act — read from captured options

    // Assert
    expect(captured_cors_options.credentials).toBe(true);
  });

  /**
   * Verifies that required HTTP methods are allowed — including OPTIONS for
   * preflight requests, which browsers send before cross-origin requests.
   */
  it("should_allow_required_http_methods_including_options", () => {
    // Arrange — options captured at module load time
    const methods = captured_cors_options.methods as string[];

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
  it("should_allow_content_type_and_authorization_headers", () => {
    // Arrange — options captured at module load time
    const allowed_headers = captured_cors_options.allowedHeaders as string[];

    // Act — inspect the allowedHeaders array

    // Assert
    expect(allowed_headers).toContain("Content-Type");
    expect(allowed_headers).toContain("Authorization");
  });

  /**
   * Verifies the middleware can be invoked and calls next(), confirming it
   * is a proper Express middleware (does not swallow the request).
   */
  it("should_call_next_when_invoked_as_middleware", () => {
    // Arrange
    const mock_req = {};
    const mock_res = {};
    const mock_next = vi.fn();

    // Act
    (cors_middleware as (req: unknown, res: unknown, next: () => void) => void)(
      mock_req,
      mock_res,
      mock_next,
    );

    // Assert
    expect(mock_next).toHaveBeenCalledOnce();
  });
});
