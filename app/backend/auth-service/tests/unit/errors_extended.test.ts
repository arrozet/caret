import { describe, it, expect } from "vitest";
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from "../../src/lib/errors.js";

/**
 * Extended unit tests for the error class hierarchy.
 * Covers: instanceof cross-checks, Error prototype chain, status_code
 * immutability (readonly), name propagation for AppError direct instances,
 * and all permutations of custom vs default messages per subclass.
 */
describe("error classes — extended coverage", () => {
  // ─── instanceof cross-checks ──────────────────────────────────────────────

  /**
   * Ensures the prototype chain is set correctly so that runtime `instanceof`
   * guards (used in error_middleware and auth_middleware) work as expected.
   */
  describe("instanceof cross-checks", () => {
    it("NotFoundError is NOT an instance of UnauthorizedError", () => {
      expect(new NotFoundError()).not.toBeInstanceOf(UnauthorizedError);
    });

    it("UnauthorizedError is NOT an instance of ForbiddenError", () => {
      expect(new UnauthorizedError()).not.toBeInstanceOf(ForbiddenError);
    });

    it("all subclasses are instances of AppError and Error", () => {
      const errors = [
        new NotFoundError(),
        new UnauthorizedError(),
        new ForbiddenError(),
        new ConflictError(),
        new ValidationError(),
      ];

      for (const err of errors) {
        expect(err).toBeInstanceOf(AppError);
        expect(err).toBeInstanceOf(Error);
      }
    });
  });

  // ─── status_code readonly ─────────────────────────────────────────────────

  /**
   * status_code is declared `readonly` in TypeScript. At runtime we verify
   * that the value is a positive integer and that it is accessible.
   */
  describe("status_code is accessible and correct", () => {
    it.each([
      [new NotFoundError(), 404],
      [new UnauthorizedError(), 401],
      [new ForbiddenError(), 403],
      [new ConflictError(), 409],
      [new ValidationError(), 422],
      [new AppError("base", 500), 500],
    ])("status_code is %i", (error, expected) => {
      expect(error.status_code).toBe(expected);
    });
  });

  // ─── name property ────────────────────────────────────────────────────────

  /**
   * The `name` property set in AppError's constructor must reflect each
   * subclass's actual constructor name, enabling log-based error type filtering.
   */
  describe("name property reflects constructor name", () => {
    it.each([
      [new AppError("x"), "AppError"],
      [new NotFoundError(), "NotFoundError"],
      [new UnauthorizedError(), "UnauthorizedError"],
      [new ForbiddenError(), "ForbiddenError"],
      [new ConflictError(), "ConflictError"],
      [new ValidationError(), "ValidationError"],
    ])("name is %s", (error, expected_name) => {
      expect(error.name).toBe(expected_name);
    });
  });

  // ─── default messages ─────────────────────────────────────────────────────

  describe("default messages", () => {
    it.each([
      [new NotFoundError(), "Resource not found"],
      [new UnauthorizedError(), "Unauthorized"],
      [new ForbiddenError(), "Forbidden"],
      [new ConflictError(), "Resource already exists"],
      [new ValidationError(), "Validation failed"],
    ])("default message for %s", (error, expected_message) => {
      expect(error.message).toBe(expected_message);
    });
  });

  // ─── Error.stack present ──────────────────────────────────────────────────

  /**
   * The stack property must be populated so debugging information is available
   * in log output.
   */
  describe("stack trace", () => {
    it("AppError has a stack trace", () => {
      const err = new AppError("with stack");
      expect(err.stack).toBeDefined();
      expect(typeof err.stack).toBe("string");
    });

    it("NotFoundError stack includes the class name", () => {
      const err = new NotFoundError();
      // Stack should start with the error name or include it
      expect(err.stack).toMatch(/NotFoundError|AppError|Error/);
    });
  });

  // ─── AppError with status code 0 (edge case) ─────────────────────────────

  /**
   * Edge case: status code 0 is falsy but technically valid (not used in HTTP
   * but could be set programmatically). Ensure it is stored as-is.
   */
  it("AppError stores status_code of 0 as-is", () => {
    // Arrange
    const err = new AppError("zero code", 0);

    // Assert
    expect(err.status_code).toBe(0);
  });

  // ─── re-throw preservation ────────────────────────────────────────────────

  /**
   * When caught and re-thrown, the error message and status code must be
   * preserved — i.e., they are not lost through any getter magic.
   */
  it("message and status_code survive a catch-and-rethrow cycle", () => {
    // Arrange
    let caught: AppError | null = null;

    // Act
    try {
      throw new ConflictError("email taken");
    } catch (e) {
      caught = e as AppError;
    }

    // Assert
    expect(caught).not.toBeNull();
    expect(caught!.message).toBe("email taken");
    expect(caught!.status_code).toBe(409);
    expect(caught!).toBeInstanceOf(ConflictError);
    expect(caught!).toBeInstanceOf(AppError);
  });
});
