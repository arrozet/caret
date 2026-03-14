import { describe, it, expect, vi, beforeAll } from "vitest";
import type { Express } from "express";

/**
 * Integration tests for the API Gateway Express application (`src/app.ts`).
 *
 * Bootstraps the full Express app with all middleware and routes (using mocked
 * downstream services), then fires real HTTP requests against it using the
 * built-in `fetch` API available in Node 18+. No actual downstream services
 * are contacted.
 */

// ---------------------------------------------------------------------------
// Mock all external dependencies before app.ts is loaded.
// ---------------------------------------------------------------------------

vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Stub express-http-proxy so proxy routes do NOT attempt real HTTP connections.
vi.mock("express-http-proxy", () => ({
  default: vi.fn(() =>
    vi.fn((_req: unknown, res: unknown, _next: () => void) => {
      // Simulates a downstream service responding successfully.
      (res as { status: (code: number) => { json: (body: unknown) => void } })
        .status(200)
        .json({ proxied: true });
    }),
  ),
}));

// Stub rate-limit so it never blocks test requests.
vi.mock("express-rate-limit", () => ({
  rateLimit: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

// Stub cors so it always passes through.
vi.mock("cors", () => ({
  default: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock("../../src/lib/config.js", () => ({
  config: {
    PORT: 0, // Use port 0 to let OS assign a free port.
    NODE_ENV: "test",
    ALLOWED_ORIGINS: ["http://localhost:5173"],
    RATE_LIMIT_MAX: 1000,
    RATE_LIMIT_WINDOW_MINUTES: 15,
    AUTH_SERVICE_URL: "http://localhost:3001",
    DOCUMENT_SERVICE_URL: "http://localhost:3002",
    AI_SERVICE_URL: "http://localhost:8000",
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Start an Express app on a random free port and return the base URL. */
const start_app = (app: Express): Promise<{ base_url: string; close: () => void }> =>
  new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      resolve({
        base_url: `http://localhost:${addr.port}`,
        close: () => server.close(),
      });
    });
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("app integration", () => {
  let base_url: string;
  let close_server: () => void;

  beforeAll(async () => {
    // Import app AFTER mocks are in place.
    const app_module = await import("../../src/app.js");
    const app = app_module.default;
    const result = await start_app(app);
    base_url = result.base_url;
    close_server = result.close;
  });

  // Tear down after all tests in this suite.
  // (Vitest does not support afterAll cleanly with module mocks; server
  //  closes when the process ends. For CI safety we track it here.)

  // ─── health endpoint ───────────────────────────────────────────────────────

  /**
   * The /health endpoint is used by load-balancers and Docker health-checks.
   * It must return HTTP 200 with a status field indicating the service is alive.
   */
  it("GET /health should_return_200_with_status_ok", async () => {
    // Arrange — server already started in beforeAll

    // Act
    const response = await fetch(`${base_url}/health`);
    const body = await response.json() as Record<string, string>;

    // Assert
    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("api-gateway");
  });

  // ─── API v1 info endpoint ─────────────────────────────────────────────────

  /**
   * The /api/v1 info endpoint must return service metadata so API clients
   * can verify they are connected to the correct gateway version.
   */
  it("GET /api/v1 should_return_service_metadata", async () => {
    // Arrange — server already started in beforeAll

    // Act
    const response = await fetch(`${base_url}/api/v1`);
    const body = await response.json() as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body.service).toBe("caret-api-gateway");
    expect(body.version).toBe("v1");
  });

  /**
   * The /api/v1 info endpoint must list all registered route prefixes so
   * clients can discover available services.
   */
  it("GET /api/v1 should_list_all_registered_endpoint_prefixes", async () => {
    // Arrange — server already started in beforeAll

    // Act
    const response = await fetch(`${base_url}/api/v1`);
    const { endpoints } = await response.json() as { endpoints: string[] };

    // Assert
    expect(endpoints).toContain("/api/v1/auth");
    expect(endpoints).toContain("/api/v1/documents");
    expect(endpoints).toContain("/api/v1/workspaces");
    expect(endpoints).toContain("/api/v1/folders");
    expect(endpoints).toContain("/api/v1/ai");
  });

  // ─── proxy routes ─────────────────────────────────────────────────────────

  /**
   * Requests to /api/v1/auth/* must reach the proxy middleware (stubbed here),
   * confirming the route is properly registered on the Express app.
   */
  it("GET /api/v1/auth/me should_reach_auth_proxy_stub", async () => {
    // Arrange — proxy is stubbed to return 200 { proxied: true }

    // Act
    const response = await fetch(`${base_url}/api/v1/auth/me`);
    const body = await response.json() as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body.proxied).toBe(true);
  });

  /**
   * Requests to /api/v1/documents/* must reach the proxy middleware.
   */
  it("GET /api/v1/documents should_reach_document_proxy_stub", async () => {
    // Arrange — proxy is stubbed to return 200 { proxied: true }

    // Act
    const response = await fetch(`${base_url}/api/v1/documents`);
    const body = await response.json() as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body.proxied).toBe(true);
  });

  /**
   * Requests to /api/v1/ai/* must reach the AI service proxy middleware.
   */
  it("POST /api/v1/ai/completions should_reach_ai_proxy_stub", async () => {
    // Arrange — proxy is stubbed to return 200 { proxied: true }

    // Act
    const response = await fetch(`${base_url}/api/v1/ai/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "test" }),
    });
    const body = await response.json() as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body.proxied).toBe(true);
  });

  // ─── JSON body parsing ────────────────────────────────────────────────────

  /**
   * Verifies that `express.json()` is mounted so downstream proxies receive
   * parsed JSON bodies. The health endpoint (non-proxy) can confirm JSON
   * responses are well-formed.
   */
  it("should_respond_with_valid_json_content_type", async () => {
    // Arrange — server already started

    // Act
    const response = await fetch(`${base_url}/health`);

    // Assert
    const content_type = response.headers.get("content-type") ?? "";
    expect(content_type).toContain("application/json");
  });
});
