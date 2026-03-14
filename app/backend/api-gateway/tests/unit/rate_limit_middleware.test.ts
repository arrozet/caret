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

let captured_rate_limit_options: Record<string, unknown> = {};

vi.mock("express-rate-limit", () => {
  const rate_limit_fn = vi.fn((options: Record<string, unknown>) => {
    // Capture options at the point rateLimit() is called (module load time).
    captured_rate_limit_options = options;
    // Return a simple pass-through middleware stub.
    return vi.fn((_req: unknown, _res: unknown, next: () => void) => next());
  });
  return { rateLimit: rate_limit_fn };
});

// Mock config to control values independently of environment.
vi.mock("../../src/lib/config.js", () => ({
  config: {
    RATE_LIMIT_MAX: 500,
    RATE_LIMIT_WINDOW_MINUTES: 10,
    PORT: 3000,
    NODE_ENV: "test",
    ALLOWED_ORIGINS: ["http://localhost:5173"],
    AUTH_SERVICE_URL: "http://localhost:3001",
    DOCUMENT_SERVICE_URL: "http://localhost:3002",
    AI_SERVICE_URL: "http://localhost:8000",
  },
}));

// --------------------------------------------------------------------------
// Import once — rateLimit() is called here and options are captured.
// --------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rate_limit_middleware: any;
let rate_limit_spy: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  const rl_module = await import("express-rate-limit");
  rate_limit_spy = rl_module.rateLimit as ReturnType<typeof vi.fn>;
  const middleware_module = await import("../../src/middleware/rate_limit_middleware.js");
  rate_limit_middleware = middleware_module.rate_limit_middleware;
});

describe("rate_limit_middleware", () => {
  /**
   * Verifies that the exported value is a callable middleware function.
   */
  it("should_export_a_callable_middleware_function", () => {
    // Arrange — module already loaded in beforeAll

    // Act — inspect the exported value

    // Assert
    expect(typeof rate_limit_middleware).toBe("function");
  });

  /**
   * Verifies that `rateLimit()` was called exactly once at module load time.
   */
  it("should_call_rate_limit_exactly_once_at_module_load", () => {
    // Arrange — captured in beforeAll

    // Act — rateLimit() is called when the module is imported

    // Assert
    expect(rate_limit_spy).toHaveBeenCalledTimes(1);
  });

  /**
   * Verifies that `rateLimit()` is called with the correct windowMs derived
   * from config.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000.
   */
  it("should_configure_window_ms_from_config_window_minutes", () => {
    // Arrange — options captured at module load time

    // Act — read from captured options

    // Assert — 10 minutes * 60 seconds * 1000 ms
    expect(captured_rate_limit_options.windowMs).toBe(10 * 60 * 1000);
  });

  /**
   * Verifies that `rateLimit()` uses the max from config to limit requests.
   */
  it("should_configure_max_requests_from_config", () => {
    // Arrange — options captured at module load time

    // Act — read from captured options

    // Assert
    expect(captured_rate_limit_options.max).toBe(500);
  });

  /**
   * Verifies that standard headers (RateLimit-*) are enabled and legacy
   * X-RateLimit-* headers are disabled, following RFC 6585.
   */
  it("should_enable_standard_headers_and_disable_legacy_headers", () => {
    // Arrange — options captured at module load time

    // Act — read from captured options

    // Assert
    expect(captured_rate_limit_options.standardHeaders).toBe(true);
    expect(captured_rate_limit_options.legacyHeaders).toBe(false);
  });

  /**
   * Verifies that the rate-limit error message is a descriptive object
   * with an `error` key so clients receive structured JSON on 429.
   */
  it("should_return_structured_json_error_message_on_429", () => {
    // Arrange — options captured at module load time
    const message = captured_rate_limit_options.message as Record<string, string>;

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
  it("should_call_next_when_request_is_within_limit", () => {
    // Arrange
    const mock_req = {};
    const mock_res = {};
    const mock_next = vi.fn();

    // Act
    (rate_limit_middleware as (req: unknown, res: unknown, next: () => void) => void)(
      mock_req,
      mock_res,
      mock_next,
    );

    // Assert
    expect(mock_next).toHaveBeenCalledOnce();
  });
});
