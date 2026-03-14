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
 * Unit tests for the error hierarchy in lib/errors.ts.
 * Validates status codes, messages, inheritance, and name properties
 * so that error_middleware can correctly map them to HTTP responses.
 */
describe("AppError hierarchy", () => {
  /**
   * Verifica que AppError configure correctamente el status_code
   * y sea instancia de Error para que los catch genéricos funcionen.
   */
  describe("AppError", () => {
    /** verifica que el constructor asigna message y status_code correctamente */
    it("should_set_message_and_status_code", () => {
      // Arrange
      const message = "Something went wrong";
      const status = 503;

      // Act
      const error = new AppError(message, status);

      // Assert
      expect(error.message).toBe(message);
      expect(error.status_code).toBe(status);
      expect(error).toBeInstanceOf(Error);
    });

    /** verifica que el status_code por defecto sea 500 */
    it("should_default_status_code_to_500", () => {
      // Arrange & Act
      const error = new AppError("oops");

      // Assert
      expect(error.status_code).toBe(500);
    });

    /** verifica que el name del error sea el nombre de la clase */
    it("should_set_name_to_constructor_name", () => {
      // Arrange & Act
      const error = new AppError("msg");

      // Assert
      expect(error.name).toBe("AppError");
    });
  });

  /**
   * Verifica que NotFoundError hereda de AppError con status 404.
   */
  describe("NotFoundError", () => {
    /** verifica que tiene status 404 y hereda de AppError */
    it("should_have_status_404_and_inherit_from_AppError", () => {
      // Arrange & Act
      const error = new NotFoundError();

      // Assert
      expect(error.status_code).toBe(404);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });

    /** verifica que el mensaje por defecto es "Resource not found" */
    it("should_use_default_message", () => {
      // Arrange & Act
      const error = new NotFoundError();

      // Assert
      expect(error.message).toBe("Resource not found");
    });

    /** verifica que se puede personalizar el mensaje */
    it("should_accept_custom_message", () => {
      // Arrange & Act
      const error = new NotFoundError("Document not found");

      // Assert
      expect(error.message).toBe("Document not found");
    });

    /** verifica que el name es "NotFoundError" */
    it("should_have_correct_name", () => {
      // Arrange & Act
      const error = new NotFoundError();

      // Assert
      expect(error.name).toBe("NotFoundError");
    });
  });

  /**
   * Verifica que UnauthorizedError hereda de AppError con status 401.
   */
  describe("UnauthorizedError", () => {
    /** verifica status 401 y herencia */
    it("should_have_status_401_and_inherit_from_AppError", () => {
      // Arrange & Act
      const error = new UnauthorizedError();

      // Assert
      expect(error.status_code).toBe(401);
      expect(error).toBeInstanceOf(AppError);
    });

    /** verifica mensaje por defecto */
    it("should_use_default_message", () => {
      // Arrange & Act
      const error = new UnauthorizedError();

      // Assert
      expect(error.message).toBe("Unauthorized");
    });

    /** verifica nombre de clase */
    it("should_have_correct_name", () => {
      // Arrange & Act
      const error = new UnauthorizedError();

      // Assert
      expect(error.name).toBe("UnauthorizedError");
    });
  });

  /**
   * Verifica que ForbiddenError hereda de AppError con status 403.
   */
  describe("ForbiddenError", () => {
    /** verifica status 403 y herencia */
    it("should_have_status_403_and_inherit_from_AppError", () => {
      // Arrange & Act
      const error = new ForbiddenError();

      // Assert
      expect(error.status_code).toBe(403);
      expect(error).toBeInstanceOf(AppError);
    });

    /** verifica mensaje por defecto */
    it("should_use_default_message", () => {
      // Arrange & Act
      const error = new ForbiddenError();

      // Assert
      expect(error.message).toBe("Forbidden");
    });

    /** verifica mensaje personalizado */
    it("should_accept_custom_message", () => {
      // Arrange & Act
      const error = new ForbiddenError("You are not a member of this workspace");

      // Assert
      expect(error.message).toBe("You are not a member of this workspace");
    });
  });

  /**
   * Verifica que ConflictError hereda de AppError con status 409.
   */
  describe("ConflictError", () => {
    /** verifica status 409 y herencia */
    it("should_have_status_409_and_inherit_from_AppError", () => {
      // Arrange & Act
      const error = new ConflictError();

      // Assert
      expect(error.status_code).toBe(409);
      expect(error).toBeInstanceOf(AppError);
    });

    /** verifica mensaje por defecto */
    it("should_use_default_message", () => {
      // Arrange & Act
      const error = new ConflictError();

      // Assert
      expect(error.message).toBe("Resource already exists");
    });
  });

  /**
   * Verifica que ValidationError hereda de AppError con status 422.
   */
  describe("ValidationError", () => {
    /** verifica status 422 y herencia */
    it("should_have_status_422_and_inherit_from_AppError", () => {
      // Arrange & Act
      const error = new ValidationError();

      // Assert
      expect(error.status_code).toBe(422);
      expect(error).toBeInstanceOf(AppError);
    });

    /** verifica mensaje por defecto */
    it("should_use_default_message", () => {
      // Arrange & Act
      const error = new ValidationError();

      // Assert
      expect(error.message).toBe("Validation failed");
    });

    /** verifica que todos los errores pueden usarse con instanceof AppError */
    it("all_subtypes_should_be_instanceof_AppError", () => {
      // Arrange
      const errors = [
        new NotFoundError(),
        new UnauthorizedError(),
        new ForbiddenError(),
        new ConflictError(),
        new ValidationError(),
      ];

      // Act & Assert
      for (const err of errors) {
        expect(err).toBeInstanceOf(AppError);
        expect(err).toBeInstanceOf(Error);
      }
    });
  });
});
