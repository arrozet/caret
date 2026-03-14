import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { error_middleware } from "../../src/middleware/error_middleware.js";
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from "../../src/lib/errors.js";

/**
 * Unit tests for error_middleware.
 * Verifica que el handler global de errores mapea correctamente
 * los subtipos de AppError a sus códigos HTTP y que los errores
 * desconocidos retornan 500 sin exponer detalles internos.
 */
describe("error_middleware", () => {
  /**
   * Construye mocks mínimos de req, res y next para las pruebas.
   */
  function make_mocks() {
    const req = {} as Request;
    const json_mock = vi.fn();
    const status_mock = vi.fn().mockReturnValue({ json: json_mock });
    const res = {
      status: status_mock,
      json: json_mock,
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;
    return { req, res, status_mock, json_mock, next };
  }

  /** verifica que NotFoundError genera status 404 con el mensaje correcto */
  it("should_respond_404_for_NotFoundError", () => {
    // Arrange
    const { req, res, status_mock, json_mock, next } = make_mocks();
    const err = new NotFoundError("Document not found");

    // Act
    error_middleware(err, req, res, next);

    // Assert
    expect(status_mock).toHaveBeenCalledWith(404);
    expect(json_mock).toHaveBeenCalledWith({ error: "Document not found" });
  });

  /** verifica que UnauthorizedError genera status 401 */
  it("should_respond_401_for_UnauthorizedError", () => {
    // Arrange
    const { req, res, status_mock, json_mock, next } = make_mocks();
    const err = new UnauthorizedError("Unauthorized");

    // Act
    error_middleware(err, req, res, next);

    // Assert
    expect(status_mock).toHaveBeenCalledWith(401);
    expect(json_mock).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  /** verifica que ForbiddenError genera status 403 */
  it("should_respond_403_for_ForbiddenError", () => {
    // Arrange
    const { req, res, status_mock, json_mock, next } = make_mocks();
    const err = new ForbiddenError("Forbidden");

    // Act
    error_middleware(err, req, res, next);

    // Assert
    expect(status_mock).toHaveBeenCalledWith(403);
    expect(json_mock).toHaveBeenCalledWith({ error: "Forbidden" });
  });

  /** verifica que ConflictError genera status 409 */
  it("should_respond_409_for_ConflictError", () => {
    // Arrange
    const { req, res, status_mock, json_mock, next } = make_mocks();
    const err = new ConflictError("Slug already taken");

    // Act
    error_middleware(err, req, res, next);

    // Assert
    expect(status_mock).toHaveBeenCalledWith(409);
    expect(json_mock).toHaveBeenCalledWith({ error: "Slug already taken" });
  });

  /** verifica que ValidationError genera status 422 */
  it("should_respond_422_for_ValidationError", () => {
    // Arrange
    const { req, res, status_mock, json_mock, next } = make_mocks();
    const err = new ValidationError("title is required");

    // Act
    error_middleware(err, req, res, next);

    // Assert
    expect(status_mock).toHaveBeenCalledWith(422);
    expect(json_mock).toHaveBeenCalledWith({ error: "title is required" });
  });

  /** verifica que AppError base genera el status_code configurado */
  it("should_respond_with_custom_status_for_base_AppError", () => {
    // Arrange
    const { req, res, status_mock, json_mock, next } = make_mocks();
    const err = new AppError("Service unavailable", 503);

    // Act
    error_middleware(err, req, res, next);

    // Assert
    expect(status_mock).toHaveBeenCalledWith(503);
    expect(json_mock).toHaveBeenCalledWith({ error: "Service unavailable" });
  });

  /** verifica que errores desconocidos (no AppError) generan status 500 genérico */
  it("should_respond_500_for_unknown_errors", () => {
    // Arrange
    const { req, res, status_mock, json_mock, next } = make_mocks();
    const err = new Error("Unexpected crash");

    // Act
    error_middleware(err, req, res, next);

    // Assert
    expect(status_mock).toHaveBeenCalledWith(500);
    expect(json_mock).toHaveBeenCalledWith({ error: "Internal server error" });
  });

  /** verifica que errores desconocidos NO exponen el mensaje interno del error */
  it("should_not_expose_internal_error_message_for_unknown_errors", () => {
    // Arrange
    const { req, res, json_mock, next } = make_mocks();
    const err = new Error("DB credentials leaked");

    // Act
    error_middleware(err, req, res, next);

    // Assert
    const response_body = json_mock.mock.calls[0][0] as { error: string };
    expect(response_body.error).not.toContain("DB credentials leaked");
    expect(response_body.error).toBe("Internal server error");
  });
});
