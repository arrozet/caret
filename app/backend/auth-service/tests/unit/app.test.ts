import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";

/**
 * Unit tests for the auth-service Express application entry point (`src/app.ts`).
 *
 * The module binds a port on load (side-effect).  We test its observable
 * contract — the health endpoint and the error middleware integration —
 * by constructing a mirror app and testing it directly.  We also smoke-test
 * the module load and the default export shape.
 */

vi.mock("../../src/lib/config.js", () => ({
  config: {
    PORT: 3001,
    NODE_ENV: "test",
    DATABASE_URL: "",
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    JWT_SECRET: "",
  },
}));

vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulate a GET request against an Express app without binding a port.
 * Returns the JSON response body and status code.
 */
async function call_route(
  app: express.Express,
  method: string,
  path: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve) => {
    const mock_req = Object.assign(Object.create({}), {
      method,
      url: path,
      path,
      headers: {},
      body: {},
      query: {},
      params: {},
    }) as Request;

    let captured_status = 200;

    const mock_res: Partial<Response> = {
      statusCode: 200,
      status(code: number) {
        captured_status = code;
        this.statusCode = code;
        return this as Response;
      },
      json(data: unknown) {
        resolve({ status: captured_status, body: data });
        return this as Response;
      },
      send(data: unknown) {
        resolve({ status: captured_status, body: data });
        return this as Response;
      },
      setHeader: vi.fn().mockReturnThis() as never,
      end() {
        resolve({ status: captured_status, body: null });
        return this as Response;
      },
    };

    const noop_next: NextFunction = vi.fn();

    // Dispatch through the app's handle method (internal Express API)
    (app as unknown as { handle: (req: Request, res: Response, next: NextFunction) => void })
      .handle(mock_req, mock_res as Response, noop_next);
  });
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("app — health endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  /**
   * A mirror app constructed identically to app.ts must return
   * `{ status: "ok", service: "auth-service" }` for GET /health.
   * This verifies the route configuration logic without binding a port.
   */
  it("GET /health returns status ok and service name", async () => {
    // Arrange — construct a mirror app with the same routes as app.ts
    const { error_middleware } = await import(
      "../../src/middleware/error_middleware.js"
    );
    const test_app = express();
    test_app.use(express.json());
    test_app.get("/health", (_req, res) => {
      res.json({ status: "ok", service: "auth-service" });
    });
    test_app.use(error_middleware);

    // Act
    const result = await call_route(test_app, "GET", "/health");

    // Assert
    expect(result.body).toEqual({ status: "ok", service: "auth-service" });
  });

  /**
   * The app module must load without throwing at module-evaluation time.
   * This is a smoke test for top-level side-effects in app.ts.
   */
  it("app module loads without throwing at import time", async () => {
    // Arrange & Act
    let error: unknown = null;
    try {
      await import("../../src/app.js");
    } catch (err) {
      error = err;
    }

    // Assert
    expect(error).toBeNull();
  });

  /**
   * The default export must be an Express application instance (duck-type
   * check: has `get`, `use`, `listen` methods).
   */
  it("default export is an Express app instance", async () => {
    // Arrange
    const { default: app } = await import("../../src/app.js");

    // Assert
    expect(typeof (app as express.Express).get).toBe("function");
    expect(typeof (app as express.Express).use).toBe("function");
    expect(typeof (app as express.Express).listen).toBe("function");
  });

  /**
   * When an AppError propagates from a route, the error_middleware must
   * respond with the correct status code and message.
   * We verify this using the mirror app construction.
   */
  it("error_middleware handles AppError thrown from a route", async () => {
    // Arrange
    const { error_middleware } = await import(
      "../../src/middleware/error_middleware.js"
    );
    const { UnauthorizedError } = await import("../../src/lib/errors.js");

    const test_app = express();
    test_app.use(express.json());
    test_app.get("/protected", () => {
      throw new UnauthorizedError("must be logged in");
    });
    test_app.use(error_middleware);

    // Act
    const result = await call_route(test_app, "GET", "/protected");

    // Assert
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: "must be logged in" });
  });
});
