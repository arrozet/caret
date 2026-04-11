import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";

/**
 * Unit tests for the proxy routing logic inside `src/routes/index.ts`.
 *
 * Focuses on the internal `proxyReqPathResolver` and `proxyErrorHandler`
 * callbacks that are passed to `express-http-proxy`, verifying path
 * rewriting and error propagation behaviour without real HTTP traffic.
 */

// --------------------------------------------------------------------------
// Capture proxy() options by intercepting express-http-proxy at import time.
// --------------------------------------------------------------------------
type ProxyOptions = {
  proxyReqPathResolver?: (req: Request) => string;
  proxyErrorHandler?: (err: Error, res: unknown, next: (err?: unknown) => void) => void;
};

const capturedProxyCalls: Array<{ target: string; options: ProxyOptions }> = [];

vi.mock("express-http-proxy", () => ({
  default: vi.fn((target: string, options: ProxyOptions) => {
    capturedProxyCalls.push({ target, options });
    // Return a simple passthrough middleware stub.
    return vi.fn((_req: unknown, _res: unknown, next: () => void) => next());
  }),
}));

vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../src/lib/config.js", () => ({
  config: {
    port: 3000,
    nodeEnv: "test",
    allowedOrigins: ["http://localhost:5173"],
    rateLimitMax: 1000,
    rateLimitWindowMinutes: 15,
    authServiceUrl: "http://auth:3001",
    documentServiceUrl: "http://docs:3002",
    aiServiceUrl: "http://ai:8000",
  },
}));

describe("proxy routing - proxyReqPathResolver", () => {
  beforeEach(() => {
    // Clear captured calls before each test so assertions are independent.
    capturedProxyCalls.length = 0;
    vi.clearAllMocks();
  });

  /**
   * Helper: trigger route registration and return all captured proxy options
   * for a given target URL.
   */
  const getOptionsForTarget = async (target: string): Promise<ProxyOptions> => {
    const { registerRoutes } = await import("../../src/routes/index.js");
    const mockApp = { use: vi.fn(), get: vi.fn() };
    registerRoutes(mockApp as never);
    const found = capturedProxyCalls.find((c) => c.target === target);
    if (!found) throw new Error(`No proxy created for target: ${target}`);
    return found.options;
  };

  // ─── path rewriting ───────────────────────────────────────────────────────

  /**
   * /api/v1/documents/123 must become /documents/123 downstream so the
   * document-service doesn't need to know about the /api/v1 prefix.
   */
  it("should_strip_api_v1_prefix_from_documents_path", async () => {
    // Arrange
    const options = await getOptionsForTarget("http://docs:3002");
    const resolver = options.proxyReqPathResolver!;
    const mockReq = { originalUrl: "/api/v1/documents/abc-123", method: "GET" } as Request;

    // Act
    const result = resolver(mockReq);

    // Assert
    expect(result).toBe("/documents/abc-123");
  });

  /**
   * /api/v1/auth/login must become /auth/login downstream.
   */
  it("should_strip_api_v1_prefix_from_auth_path", async () => {
    // Arrange
    const options = await getOptionsForTarget("http://auth:3001");
    const resolver = options.proxyReqPathResolver!;
    const mockReq = { originalUrl: "/api/v1/auth/login", method: "POST" } as Request;

    // Act
    const result = resolver(mockReq);

    // Assert
    expect(result).toBe("/auth/login");
  });

  /**
   * /api/v1/ai/completions must become /ai/completions downstream.
   */
  it("should_strip_api_v1_prefix_from_ai_path", async () => {
    // Arrange
    const options = await getOptionsForTarget("http://ai:8000");
    const resolver = options.proxyReqPathResolver!;
    const mockReq = { originalUrl: "/api/v1/ai/completions", method: "POST" } as Request;

    // Act
    const result = resolver(mockReq);

    // Assert
    expect(result).toBe("/ai/completions");
  });

  /**
   * /api/v1/workspaces must become /workspaces when no sub-path is present.
   */
  it("should_handle_path_with_no_sub_resource", async () => {
    // Arrange
    const options = await getOptionsForTarget("http://docs:3002");
    const resolver = options.proxyReqPathResolver!;
    const mockReq = { originalUrl: "/api/v1/workspaces", method: "GET" } as Request;

    // Act
    const result = resolver(mockReq);

    // Assert
    expect(result).toBe("/workspaces");
  });

  /**
   * Preserves query strings in the downstream path so filtering and pagination
   * parameters are forwarded correctly.
   */
  it("should_preserve_query_string_in_downstream_path", async () => {
    // Arrange
    const options = await getOptionsForTarget("http://docs:3002");
    const resolver = options.proxyReqPathResolver!;
    const mockReq = {
      originalUrl: "/api/v1/documents?page=2&limit=10",
      method: "GET",
    } as Request;

    // Act
    const result = resolver(mockReq);

    // Assert
    expect(result).toBe("/documents?page=2&limit=10");
  });

  /**
   * Verifies the resolver logs the proxied request so operators can trace
   * traffic flowing through the gateway.
   */
  it("should_log_the_proxied_request", async () => {
    // Arrange
    const { logger } = await import("../../src/lib/logger.js");
    const options = await getOptionsForTarget("http://auth:3001");
    const resolver = options.proxyReqPathResolver!;
    const mockReq = { originalUrl: "/api/v1/auth/me", method: "GET" } as Request;

    // Act
    resolver(mockReq);

    // Assert
    expect(logger.info).toHaveBeenCalled();
  });
});

describe("proxy routing — proxyErrorHandler", () => {
  beforeEach(() => {
    capturedProxyCalls.length = 0;
    vi.clearAllMocks();
  });

  /**
   * Helper: retrieve the proxyErrorHandler for the document service proxy.
   */
  const getErrorHandler = async () => {
    const { registerRoutes } = await import("../../src/routes/index.js");
    const mockApp = { use: vi.fn(), get: vi.fn() };
    registerRoutes(mockApp as never);
    const found = capturedProxyCalls.find((c) => c.target === "http://docs:3002");
    if (!found) throw new Error("No proxy for document service");
    return found.options.proxyErrorHandler!;
  };

  /**
   * When a downstream service is unreachable, the error must be forwarded to
   * Express's error pipeline via next(err) so `error_middleware` handles it.
   */
  it("should_call_next_with_error_when_downstream_is_unreachable", async () => {
    // Arrange
    const errorHandler = await getErrorHandler();
    const err = new Error("ECONNREFUSED");
    const mockRes = {};
    const mockNext = vi.fn();

    // Act
    errorHandler(err, mockRes, mockNext);

    // Assert
    expect(mockNext).toHaveBeenCalledWith(err);
  });

  /**
   * The proxy error must be logged so operators can detect downstream outages
   * from gateway logs without needing access to service logs.
   */
  it("should_log_the_proxy_error_message", async () => {
    // Arrange
    const { logger } = await import("../../src/lib/logger.js");
    const errorHandler = await getErrorHandler();
    const err = new Error("upstream timeout");
    const mockNext = vi.fn();

    // Act
    errorHandler(err, {}, mockNext);

    // Assert
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("upstream timeout"));
  });

  /**
   * next() must be called exactly once so the request completes and the client
   * receives a response instead of hanging indefinitely.
   */
  it("should_call_next_exactly_once_on_proxy_error", async () => {
    // Arrange
    const errorHandler = await getErrorHandler();
    const err = new Error("network error");
    const mockNext = vi.fn();

    // Act
    errorHandler(err, {}, mockNext);

    // Assert
    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});

describe("proxy routing — target assignment", () => {
  beforeEach(() => {
    capturedProxyCalls.length = 0;
    vi.clearAllMocks();
  });

  /**
   * Verifies that each logical route group is proxied to the correct
   * downstream service URL, as defined in config.
   */
  it("should_proxy_auth_routes_to_auth_service_url", async () => {
    // Arrange
    const { registerRoutes } = await import("../../src/routes/index.js");
    const mockApp = { use: vi.fn(), get: vi.fn() };

    // Act
    registerRoutes(mockApp as never);

    // Assert
    const authProxy = capturedProxyCalls.find((c) => c.target === "http://auth:3001");
    expect(authProxy).toBeDefined();
  });

  /**
   * Verifies that workspaces and folders both point to the document service,
   * since they are logically managed by the same downstream service.
   */
  it("should_proxy_workspaces_and_folders_to_document_service_url", async () => {
    // Arrange
    const { registerRoutes } = await import("../../src/routes/index.js");
    const mockApp = { use: vi.fn(), get: vi.fn() };

    // Act
    registerRoutes(mockApp as never);

    // Assert — document service proxy appears multiple times (documents + workspaces + folders)
    const docProxies = capturedProxyCalls.filter((c) => c.target === "http://docs:3002");
    expect(docProxies.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * Verifies that AI routes are proxied to the AI service URL (Python FastAPI).
   */
  it("should_proxy_ai_routes_to_ai_service_url", async () => {
    // Arrange
    const { registerRoutes } = await import("../../src/routes/index.js");
    const mockApp = { use: vi.fn(), get: vi.fn() };

    // Act
    registerRoutes(mockApp as never);

    // Assert
    const aiProxy = capturedProxyCalls.find((c) => c.target === "http://ai:8000");
    expect(aiProxy).toBeDefined();
  });
});
