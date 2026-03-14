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
 * Extended unit tests for the error middleware.
 * Covers additional edge cases: AppError with custom status code, null/undefined
 * error stacks, subclass `name` property propagation, and that the error
 * payload shape always includes only the `error` key (no stack leakage).
 */

vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("error_middleware — extended coverage", () => {
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

  // ─── custom AppError (not a subclass) ────────────────────────────────────

  /**
   * AppError constructed directly with a non-standard HTTP status code (e.g.
   * 429 Too Many Requests) must use that exact code in the response.
   */
  it("uses the custom status_code of a direct AppError instance", async () => {
    // Arrange
    const { error_middleware } = await import("../../src/middleware/error_middleware.js");
    const res = make_res();
    const rate_limit_error = new AppError("rate limit exceeded", 429);

    // Act
    error_middleware(rate_limit_error, make_req(), res, make_next());

    // Assert
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: "rate limit exceeded" });
  });

  // ─── response body never leaks stack traces ───────────────────────────────

  /**
   * The JSON response must contain only the `error` key.
   * Stack traces or implementation details must never appear in the payload.
   */
  it("response body for AppError contains only the 'error' key", async () => {
    // Arrange
    const { error_middleware } = await import("../../src/middleware/error_middleware.js");
    const res = make_res();

    // Act
    error_middleware(new ValidationError("bad input"), make_req(), res, make_next());

    // Assert
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(payload)).toEqual(["error"]);
    expect(payload.stack).toBeUndefined();
  });

  it("response body for unknown errors contains only the 'error' key", async () => {
    // Arrange
    const { error_middleware } = await import("../../src/middleware/error_middleware.js");
    const res = make_res();

    // Act
    error_middleware(new Error("something broke"), make_req(), res, make_next());

    // Assert
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(payload)).toEqual(["error"]);
    expect(payload.stack).toBeUndefined();
  });

  // ─── all AppError subclass name properties ─────────────────────────────────

  /**
   * Subclass errors must expose a `name` matching their constructor so that
   * internal logging and monitoring can distinguish error types.
   */
  it.each([
    [new NotFoundError(), "NotFoundError"],
    [new UnauthorizedError(), "UnauthorizedError"],
    [new ForbiddenError(), "ForbiddenError"],
    [new ConflictError(), "ConflictError"],
    [new ValidationError(), "ValidationError"],
  ])("%s has the correct name property", (error, expected_name) => {
    // Arrange — error already instantiated in the table

    // Act — check the name property

    // Assert
    expect(error.name).toBe(expected_name);
  });

  // ─── AppError subclasses are instanceof AppError ──────────────────────────

  /**
   * The error_middleware uses `instanceof AppError` to decide the response
   * code, so all subclasses must satisfy that check.
   */
  it.each([
    new NotFoundError(),
    new UnauthorizedError(),
    new ForbiddenError(),
    new ConflictError(),
    new ValidationError(),
  ])("%s is instanceof AppError", (error) => {
    // Assert
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  // ─── error with no stack ──────────────────────────────────────────────────

  /**
   * In some edge cases (e.g. V8 stack limit reached, minified code) an Error
   * may have an undefined `stack`. The middleware must not throw itself.
   */
  it("handles an error with no stack trace without throwing", async () => {
    // Arrange
    const { error_middleware } = await import("../../src/middleware/error_middleware.js");
    const res = make_res();
    const err = new Error("no stack");
    delete err.stack;

    // Act & Assert — must not throw
    expect(() => {
      error_middleware(err, make_req(), res, make_next());
    }).not.toThrow();

    expect(res.status).toHaveBeenCalledWith(500);
  });

  // ─── UnauthorizedError with custom message → 401 ─────────────────────────

  it("uses HTTP 401 with a custom message for UnauthorizedError", async () => {
    // Arrange
    const { error_middleware } = await import("../../src/middleware/error_middleware.js");
    const res = make_res();

    // Act
    error_middleware(
      new UnauthorizedError("token expired"),
      make_req(),
      res,
      make_next(),
    );

    // Assert
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "token expired" });
  });

  // ─── logger.error receives structured metadata for unknown errors ─────────

  it("passes message and stack metadata to logger.error for unknown errors", async () => {
    // Arrange
    const { error_middleware } = await import("../../src/middleware/error_middleware.js");
    const { logger } = await import("../../src/lib/logger.js");
    const res = make_res();
    const err = new Error("unexpected failure");

    // Act
    error_middleware(err, make_req(), res, make_next());

    // Assert
    expect(logger.error).toHaveBeenCalledWith(
      "Unhandled error",
      expect.objectContaining({ message: "unexpected failure" }),
    );
  });
});
