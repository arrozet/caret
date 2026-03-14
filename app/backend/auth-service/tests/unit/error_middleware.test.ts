import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from "../../src/lib/errors.js";

/**
 * Unit tests for the auth-service global error handler middleware
 * (`src/middleware/error_middleware.ts`).
 *
 * AppError subclasses must be mapped to their declared HTTP status codes so
 * that clients receive meaningful error responses. Any other (unexpected) error
 * must always produce a generic HTTP 500 to avoid leaking internal details.
 */

vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("error_middleware", () => {
  /** Build a minimal mock Express Response with a chainable `status()`. */
  const make_res = () =>
    ({
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }) as unknown as Response;

  const make_req = () => ({}) as Request;
  const make_next = () => vi.fn() as unknown as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── AppError subclasses → own status code ────────────────────────────────

  /**
   * Typed application errors carry an explicit HTTP status and a domain message.
   * The middleware must relay both to the client without wrapping.
   */
  describe("AppError subclasses are mapped to their declared status codes", () => {
    it("maps NotFoundError to HTTP 404 with the default message", async () => {
      // Arrange
      const { error_middleware } = await import("../../src/middleware/error_middleware.js");
      const res = make_res();

      // Act
      error_middleware(new NotFoundError(), make_req(), res, make_next());

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Resource not found" });
    });

    it("maps UnauthorizedError to HTTP 401 with the default message", async () => {
      // Arrange
      const { error_middleware } = await import("../../src/middleware/error_middleware.js");
      const res = make_res();

      // Act
      error_middleware(new UnauthorizedError(), make_req(), res, make_next());

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });

    it("maps ForbiddenError to HTTP 403", async () => {
      // Arrange
      const { error_middleware } = await import("../../src/middleware/error_middleware.js");
      const res = make_res();

      // Act
      error_middleware(new ForbiddenError(), make_req(), res, make_next());

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("maps ConflictError to HTTP 409", async () => {
      // Arrange
      const { error_middleware } = await import("../../src/middleware/error_middleware.js");
      const res = make_res();

      // Act
      error_middleware(new ConflictError(), make_req(), res, make_next());

      // Assert
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it("maps ValidationError to HTTP 422", async () => {
      // Arrange
      const { error_middleware } = await import("../../src/middleware/error_middleware.js");
      const res = make_res();

      // Act
      error_middleware(new ValidationError(), make_req(), res, make_next());

      // Assert
      expect(res.status).toHaveBeenCalledWith(422);
    });

    it("preserves a custom AppError message in the response body", async () => {
      // Arrange
      const { error_middleware } = await import("../../src/middleware/error_middleware.js");
      const res = make_res();

      // Act
      error_middleware(new NotFoundError("document not found"), make_req(), res, make_next());

      // Assert
      expect(res.json).toHaveBeenCalledWith({ error: "document not found" });
    });

    it("does not call next() when handling an AppError", async () => {
      // Arrange
      const { error_middleware } = await import("../../src/middleware/error_middleware.js");
      const next = make_next();

      // Act
      error_middleware(new UnauthorizedError(), make_req(), make_res(), next);

      // Assert
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ─── unknown errors → 500 ────────────────────────────────────────────────

  /**
   * Generic errors must always produce HTTP 500 with a safe generic message
   * to prevent leaking implementation details or stack traces to clients.
   */
  describe("unknown errors produce a safe HTTP 500 response", () => {
    it("returns HTTP 500 for a plain Error", async () => {
      // Arrange
      const { error_middleware } = await import("../../src/middleware/error_middleware.js");
      const res = make_res();

      // Act
      error_middleware(new Error("something unexpected"), make_req(), res, make_next());

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });

    it("calls logger.error for unknown errors", async () => {
      // Arrange
      const { error_middleware } = await import("../../src/middleware/error_middleware.js");
      const { logger } = await import("../../src/lib/logger.js");
      const res = make_res();

      // Act
      error_middleware(new Error("crash"), make_req(), res, make_next());

      // Assert
      expect(logger.error).toHaveBeenCalled();
    });

    it("does not call next() for unknown errors", async () => {
      // Arrange
      const { error_middleware } = await import("../../src/middleware/error_middleware.js");
      const next = make_next();

      // Act
      error_middleware(new Error("crash"), make_req(), make_res(), next);

      // Assert
      expect(next).not.toHaveBeenCalled();
    });
  });
});
