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
 * Unit tests for the collab-service error classes.
 * Each error subclass must map to the correct HTTP status code
 * and carry the expected default message.
 */
describe("error classes", () => {
  describe("AppError (base)", () => {
    it("stores the message", () => {
      const err = new AppError("something broke");
      expect(err.message).toBe("something broke");
    });

    it("defaults to status_code 500", () => {
      expect(new AppError("oops").status_code).toBe(500);
    });

    it("sets name to the class name", () => {
      expect(new AppError("oops").name).toBe("AppError");
    });

    it("accepts a custom status code", () => {
      expect(new AppError("conflict", 409).status_code).toBe(409);
    });

    it("is an instance of Error", () => {
      expect(new AppError("oops")).toBeInstanceOf(Error);
    });
  });

  describe("NotFoundError", () => {
    it("maps to status 404", () => {
      expect(new NotFoundError().status_code).toBe(404);
    });

    it("uses the default message", () => {
      expect(new NotFoundError().message).toBe("Resource not found");
    });

    it("accepts a custom message", () => {
      expect(new NotFoundError("doc not found").message).toBe("doc not found");
    });

    it("is an instance of AppError", () => {
      expect(new NotFoundError()).toBeInstanceOf(AppError);
    });
  });

  describe("UnauthorizedError", () => {
    it("maps to status 401", () => {
      expect(new UnauthorizedError().status_code).toBe(401);
    });

    it("uses the default message", () => {
      expect(new UnauthorizedError().message).toBe("Unauthorized");
    });
  });

  describe("ForbiddenError", () => {
    it("maps to status 403", () => {
      expect(new ForbiddenError().status_code).toBe(403);
    });

    it("uses the default message", () => {
      expect(new ForbiddenError().message).toBe("Forbidden");
    });
  });

  describe("ConflictError", () => {
    it("maps to status 409", () => {
      expect(new ConflictError().status_code).toBe(409);
    });

    it("uses the default message", () => {
      expect(new ConflictError().message).toBe("Resource already exists");
    });
  });

  describe("ValidationError", () => {
    it("maps to status 422", () => {
      expect(new ValidationError().status_code).toBe(422);
    });

    it("uses the default message", () => {
      expect(new ValidationError().message).toBe("Validation failed");
    });
  });

  describe("custom messages on all subtypes", () => {
    it.each([
      [new NotFoundError("x"), "x"],
      [new UnauthorizedError("bad token"), "bad token"],
      [new ForbiddenError("no access"), "no access"],
      [new ConflictError("dup"), "dup"],
      [new ValidationError("invalid"), "invalid"],
    ])("error.message equals the custom message", (err, expected) => {
      expect(err.message).toBe(expected);
    });
  });
});
