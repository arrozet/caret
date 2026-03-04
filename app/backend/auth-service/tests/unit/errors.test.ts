import { describe, it, expect } from "vitest";
import { AppError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError, ValidationError } from "../../src/lib/errors.js";

/**
 * Unit tests for the auth-service error classes.
 * Validates that each error type maps to the correct HTTP status code
 * and carries sensible default messages.
 */
describe("error classes", () => {
  it("AppError defaults to status 500", () => {
    const error = new AppError("something broke");
    expect(error.message).toBe("something broke");
    expect(error.status_code).toBe(500);
    expect(error.name).toBe("AppError");
  });

  it("NotFoundError maps to status 404", () => {
    const error = new NotFoundError();
    expect(error.status_code).toBe(404);
    expect(error.message).toBe("Resource not found");
  });

  it("UnauthorizedError maps to status 401", () => {
    const error = new UnauthorizedError();
    expect(error.status_code).toBe(401);
    expect(error.message).toBe("Unauthorized");
  });

  it("ForbiddenError maps to status 403", () => {
    const error = new ForbiddenError();
    expect(error.status_code).toBe(403);
    expect(error.message).toBe("Forbidden");
  });

  it("ConflictError maps to status 409", () => {
    const error = new ConflictError();
    expect(error.status_code).toBe(409);
    expect(error.message).toBe("Resource already exists");
  });

  it("ValidationError maps to status 422", () => {
    const error = new ValidationError();
    expect(error.status_code).toBe(422);
    expect(error.message).toBe("Validation failed");
  });

  it("allows custom messages on all error types", () => {
    expect(new NotFoundError("user not found").message).toBe("user not found");
    expect(new UnauthorizedError("bad token").message).toBe("bad token");
    expect(new ForbiddenError("no access").message).toBe("no access");
    expect(new ConflictError("duplicate email").message).toBe("duplicate email");
    expect(new ValidationError("invalid input").message).toBe("invalid input");
  });
});
