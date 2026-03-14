import { describe, it, expect, vi } from "vitest";
import type { Express, Request, Response } from "express";
import { register_routes } from "../../src/routes/index.js";

/**
 * Unit tests for the API Gateway route table (`src/routes/index.ts`).
 *
 * Validates that `register_routes` mounts each proxy route on the correct
 * path prefix and that the /api/v1 info endpoint returns the expected
 * service metadata payload without proxying any traffic.
 */

vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("register_routes", () => {
  /** Build a minimal mock Express app that records use() and get() calls. */
  const make_app = () => ({ use: vi.fn(), get: vi.fn() });

  // ─── proxy route registration ─────────────────────────────────────────────

  /**
   * Each microservice route must be mounted with app.use() so that all HTTP
   * methods and sub-paths are forwarded to the downstream service.
   */
  describe("proxy route registration", () => {
    it("mounts a proxy middleware on /api/v1/auth", () => {
      // Arrange
      const app = make_app();

      // Act
      register_routes(app as unknown as Express);

      // Assert
      const paths = app.use.mock.calls.map((c) => c[0]);
      expect(paths).toContain("/api/v1/auth");
    });

    it("mounts a proxy middleware on /api/v1/documents", () => {
      // Arrange
      const app = make_app();

      // Act
      register_routes(app as unknown as Express);

      // Assert
      const paths = app.use.mock.calls.map((c) => c[0]);
      expect(paths).toContain("/api/v1/documents");
    });

    it("mounts a proxy middleware on /api/v1/workspaces", () => {
      // Arrange
      const app = make_app();

      // Act
      register_routes(app as unknown as Express);

      // Assert
      const paths = app.use.mock.calls.map((c) => c[0]);
      expect(paths).toContain("/api/v1/workspaces");
    });

    it("mounts a proxy middleware on /api/v1/folders", () => {
      // Arrange
      const app = make_app();

      // Act
      register_routes(app as unknown as Express);

      // Assert
      const paths = app.use.mock.calls.map((c) => c[0]);
      expect(paths).toContain("/api/v1/folders");
    });

    it("mounts a proxy middleware on /api/v1/ai", () => {
      // Arrange
      const app = make_app();

      // Act
      register_routes(app as unknown as Express);

      // Assert
      const paths = app.use.mock.calls.map((c) => c[0]);
      expect(paths).toContain("/api/v1/ai");
    });

    it("each proxy route receives a function as its handler", () => {
      // Arrange
      const app = make_app();

      // Act
      register_routes(app as unknown as Express);

      // Assert — every call to app.use must pass a callable as the second arg
      for (const call of app.use.mock.calls) {
        expect(typeof call[1]).toBe("function");
      }
    });
  });

  // ─── GET /api/v1 info endpoint ────────────────────────────────────────────

  /**
   * The info endpoint allows clients to discover available service routes
   * without proxying any traffic, and returns the gateway identity.
   */
  describe("GET /api/v1 info endpoint", () => {
    it("registers a GET handler on /api/v1", () => {
      // Arrange
      const app = make_app();

      // Act
      register_routes(app as unknown as Express);

      // Assert
      const get_paths = app.get.mock.calls.map((c) => c[0]);
      expect(get_paths).toContain("/api/v1");
    });

    it("handler returns the service name and API version", () => {
      // Arrange
      const app = make_app();
      register_routes(app as unknown as Express);
      const [, handler] = app.get.mock.calls.find((c) => c[0] === "/api/v1")!;
      const res = { json: vi.fn() } as unknown as Response;

      // Act
      (handler as (req: Request, res: Response) => void)({} as Request, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ service: "caret-api-gateway", version: "v1" }),
      );
    });

    it("handler lists all five registered endpoint path prefixes", () => {
      // Arrange
      const app = make_app();
      register_routes(app as unknown as Express);
      const [, handler] = app.get.mock.calls.find((c) => c[0] === "/api/v1")!;
      const res = { json: vi.fn() } as unknown as Response;

      // Act
      (handler as (req: Request, res: Response) => void)({} as Request, res);

      // Assert
      const { endpoints } = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        endpoints: string[];
      };
      expect(endpoints).toContain("/api/v1/auth");
      expect(endpoints).toContain("/api/v1/documents");
      expect(endpoints).toContain("/api/v1/workspaces");
      expect(endpoints).toContain("/api/v1/folders");
      expect(endpoints).toContain("/api/v1/ai");
    });
  });
});
