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
 * Unit tests for the auth-service error class hierarchy (`src/lib/errors.ts`).
 *
 * Validates that each concrete error subclass carries the correct default
 * HTTP status code, default message, and `name` property, and that the
 * inheritance chain is correct so `instanceof` checks work throughout the
 * service.
 */
describe("error classes", () => {
  // ─── AppError (base class) ────────────────────────────────────────────────

  /**
   * AppError is the base for all typed application errors.
   * It must accept an arbitrary message, default to HTTP 500, set its `name`
   * to the class constructor name, and satisfy `instanceof Error`.
   */
  describe("AppError (base class)", () => {
    it("stores the message passed to the constructor", () => {
      // Arrange
      const message = "something broke";

      // Act
      const error = new AppError(message);

      // Assert
      expect(error.message).toBe(message);
    });

    it("defaults to status_code 500 when no code is provided", () => {
      // Arrange — no explicit status code

      // Act
      const error = new AppError("oops");

      // Assert
      expect(error.statusCode).toBe(500);
    });

    it("accepts a custom status code", () => {
      // Arrange
      const custom_code = 409;

      // Act
      const error = new AppError("conflict", custom_code);

      // Assert
      expect(error.statusCode).toBe(custom_code);
    });

    it("sets the name property to 'AppError'", () => {
      // Arrange — no setup needed

      // Act
      const error = new AppError("oops");

      // Assert
      expect(error.name).toBe("AppError");
    });

    it("is an instance of the built-in Error class", () => {
      // Arrange — no setup needed

      // Act
      const error = new AppError("oops");

      // Assert
      expect(error).toBeInstanceOf(Error);
    });
  });

  // ─── NotFoundError ────────────────────────────────────────────────────────

  /**
   * NotFoundError signals that a requested resource does not exist.
   * Maps to HTTP 404.
   */
  describe("NotFoundError", () => {
    it("maps to HTTP 404", () => {
      // Arrange — no setup needed

      // Act
      const error = new NotFoundError();

      // Assert
      expect(error.statusCode).toBe(404);
    });

    it("uses the default 'Resource not found' message", () => {
      // Arrange — no setup needed

      // Act
      const error = new NotFoundError();

      // Assert
      expect(error.message).toBe("Resource not found");
    });

    it("accepts a custom message", () => {
      // Arrange
      const message = "user not found";

      // Act
      const error = new NotFoundError(message);

      // Assert
      expect(error.message).toBe(message);
    });

    it("is an instance of AppError", () => {
      // Arrange — no setup needed

      // Act
      const error = new NotFoundError();

      // Assert
      expect(error).toBeInstanceOf(AppError);
    });
  });

  // ─── UnauthorizedError ────────────────────────────────────────────────────

  /**
   * UnauthorizedError signals missing or invalid credentials.
   * Maps to HTTP 401.
   */
  describe("UnauthorizedError", () => {
    it("maps to HTTP 401", () => {
      // Arrange — no setup needed

      // Act
      const error = new UnauthorizedError();

      // Assert
      expect(error.statusCode).toBe(401);
    });

    it("uses the default 'Unauthorized' message", () => {
      // Arrange — no setup needed

      // Act
      const error = new UnauthorizedError();

      // Assert
      expect(error.message).toBe("Unauthorized");
    });
  });

  // ─── ForbiddenError ───────────────────────────────────────────────────────

  /**
   * ForbiddenError signals valid credentials but insufficient permissions.
   * Maps to HTTP 403.
   */
  describe("ForbiddenError", () => {
    it("maps to HTTP 403", () => {
      // Arrange — no setup needed

      // Act
      const error = new ForbiddenError();

      // Assert
      expect(error.statusCode).toBe(403);
    });

    it("uses the default 'Forbidden' message", () => {
      // Arrange — no setup needed

      // Act
      const error = new ForbiddenError();

      // Assert
      expect(error.message).toBe("Forbidden");
    });
  });

  // ─── ConflictError ────────────────────────────────────────────────────────

  /**
   * ConflictError signals a uniqueness violation (e.g. duplicate resource).
   * Maps to HTTP 409.
   */
  describe("ConflictError", () => {
    it("maps to HTTP 409", () => {
      // Arrange — no setup needed

      // Act
      const error = new ConflictError();

      // Assert
      expect(error.statusCode).toBe(409);
    });

    it("uses the default 'Resource already exists' message", () => {
      // Arrange — no setup needed

      // Act
      const error = new ConflictError();

      // Assert
      expect(error.message).toBe("Resource already exists");
    });
  });

  // ─── ValidationError ──────────────────────────────────────────────────────

  /**
   * ValidationError signals that a request body or parameter failed
   * validation rules. Maps to HTTP 422.
   */
  describe("ValidationError", () => {
    it("maps to HTTP 422", () => {
      // Arrange — no setup needed

      // Act
      const error = new ValidationError();

      // Assert
      expect(error.statusCode).toBe(422);
    });

    it("uses the default 'Validation failed' message", () => {
      // Arrange — no setup needed

      // Act
      const error = new ValidationError();

      // Assert
      expect(error.message).toBe("Validation failed");
    });
  });

  // ─── custom messages ──────────────────────────────────────────────────────

  /**
   * All subclasses must forward a custom message to the base Error constructor
   * so callers can provide context-specific error text.
   */
  describe("all subtypes accept custom messages", () => {
    it.each([
      [new NotFoundError("user not found"), "user not found"],
      [new UnauthorizedError("bad token"), "bad token"],
      [new ForbiddenError("no access"), "no access"],
      [new ConflictError("duplicate email"), "duplicate email"],
      [new ValidationError("invalid input"), "invalid input"],
    ])("error.message equals the custom message passed at construction", (error, expected) => {
      // Arrange — error already constructed in the table above

      // Act — read the message property

      // Assert
      expect(error.message).toBe(expected);
    });
  });
});
