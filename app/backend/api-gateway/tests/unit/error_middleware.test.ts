import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

/**
 * Unit tests for the API Gateway global error handler middleware
 * (`src/middleware/error_middleware.ts`).
 *
 * The middleware is the last in the Express pipeline. It must:
 *   - always respond HTTP 500 with `{ error: "Internal server error" }`,
 *   - log the original error message and stack via `logger.error`, and
 *   - never call `next()` so the error does not propagate further.
 */

vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("errorMiddleware", () => {
  /** Build a minimal mock Express Response with a chainable `status()`. */
  const makeRes = () =>
    ({
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }) as unknown as Response;

  const makeReq = () => ({}) as Request;
  const makeNext = () => vi.fn() as unknown as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── HTTP status ──────────────────────────────────────────────────────────

  it("responds with HTTP 500 for any unhandled error", async () => {
    // Arrange
    const { errorMiddleware } = await import("../../src/middleware/error_middleware.js");
    const res = makeRes();
    const err = new Error("boom");

    // Act
    errorMiddleware(err, makeReq(), res, makeNext());

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // ─── response body ────────────────────────────────────────────────────────

  it("responds with the standard 'Internal server error' JSON body", async () => {
    // Arrange
    const { errorMiddleware } = await import("../../src/middleware/error_middleware.js");
    const res = makeRes();
    const err = new Error("boom");

    // Act
    errorMiddleware(err, makeReq(), res, makeNext());

    // Assert
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
  });

  // ─── logging ──────────────────────────────────────────────────────────────

  it("logs the error message and stack via logger.error", async () => {
    // Arrange
    const { errorMiddleware } = await import("../../src/middleware/error_middleware.js");
    const { logger } = await import("../../src/lib/logger.js");
    const err = new Error("something broke");
    const res = makeRes();

    // Act
    errorMiddleware(err, makeReq(), res, makeNext());

    // Assert
    expect(logger.error).toHaveBeenCalledWith(
      "something broke",
      expect.objectContaining({ stack: err.stack }),
    );
  });

  // ─── next() behaviour ─────────────────────────────────────────────────────

  it("never calls next() because the error is fully handled here", async () => {
    // Arrange
    const { errorMiddleware } = await import("../../src/middleware/error_middleware.js");
    const next = makeNext();
    const res = makeRes();

    // Act
    errorMiddleware(new Error("handled"), makeReq(), res, next);

    // Assert
    expect(next).not.toHaveBeenCalled();
  });

  // ─── edge cases ───────────────────────────────────────────────────────────

  it("handles errors that have no stack trace without throwing", async () => {
    // Arrange
    const { errorMiddleware } = await import("../../src/middleware/error_middleware.js");
    const err = new Error("no stack");
    delete err.stack;
    const res = makeRes();

    // Act & Assert — must not throw internally
    expect(() => errorMiddleware(err, makeReq(), res, makeNext())).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
