import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage } from "http";
import { validate_ws_token } from "../../src/middleware/auth_middleware.js";
import { UnauthorizedError } from "../../src/lib/errors.js";

/**
 * Unit tests for the WebSocket JWT authentication middleware.
 * Verifica que validate_ws_token extraiga correctamente el token del query param
 * y rechace conexiones sin token con UnauthorizedError.
 */
describe("validate_ws_token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Construye un IncomingMessage mock con la URL y host dados.
   */
  function make_mock_request(url: string, host = "localhost:3003"): IncomingMessage {
    return {
      url,
      headers: { host },
    } as unknown as IncomingMessage;
  }

  /** Verifica que devuelva el token cuando está presente en el query param */
  it("should_return_token_when_present_in_query_param", async () => {
    // Arrange
    const jwt_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig";
    const req = make_mock_request(`/document/doc-123?token=${jwt_token}`);

    // Act
    const result = await validate_ws_token(req);

    // Assert
    expect(result).toBe(jwt_token);
  });

  /** Verifica que lance UnauthorizedError cuando falta el query param token */
  it("should_throw_unauthorized_error_when_token_missing", async () => {
    // Arrange
    const req = make_mock_request("/document/doc-123");

    // Act & Assert
    await expect(validate_ws_token(req)).rejects.toThrow(UnauthorizedError);
  });

  /** Verifica el mensaje de error cuando falta el token */
  it("should_throw_with_missing_token_message", async () => {
    // Arrange
    const req = make_mock_request("/document/doc-123");

    // Act & Assert
    await expect(validate_ws_token(req)).rejects.toThrow(
      "Missing token query parameter"
    );
  });

  /** Verifica que lance UnauthorizedError con status 401 cuando token está ausente */
  it("should_throw_unauthorized_error_with_status_401", async () => {
    // Arrange
    const req = make_mock_request("/document/doc-abc");

    // Act
    let caught_error: unknown;
    try {
      await validate_ws_token(req);
    } catch (e) {
      caught_error = e;
    }

    // Assert
    expect(caught_error).toBeInstanceOf(UnauthorizedError);
    expect((caught_error as UnauthorizedError).status_code).toBe(401);
  });

  /** Verifica que maneje correctamente URL sin query string */
  it("should_throw_when_url_has_no_query_string", async () => {
    // Arrange
    const req = make_mock_request("/document/doc-999");

    // Act & Assert
    await expect(validate_ws_token(req)).rejects.toThrow(UnauthorizedError);
  });

  /** Verifica que maneje URL vacía (url = undefined → "") */
  it("should_throw_when_url_is_undefined", async () => {
    // Arrange
    const req = {
      url: undefined,
      headers: { host: "localhost:3003" },
    } as unknown as IncomingMessage;

    // Act & Assert
    await expect(validate_ws_token(req)).rejects.toThrow(UnauthorizedError);
  });

  /** Verifica que devuelva el token exacto incluso con caracteres especiales URL-encoded */
  it("should_return_decoded_token_when_url_encoded", async () => {
    // Arrange
    const raw_token = "header.payload.signature";
    const req = make_mock_request(
      `/document/doc-123?token=${encodeURIComponent(raw_token)}`
    );

    // Act
    const result = await validate_ws_token(req);

    // Assert
    expect(result).toBe(raw_token);
  });

  /** Verifica que funcione con múltiples query params y token al final */
  it("should_extract_token_when_multiple_query_params_present", async () => {
    // Arrange
    const token = "my.jwt.token";
    const req = make_mock_request(
      `/document/doc-123?version=2&token=${token}&foo=bar`
    );

    // Act
    const result = await validate_ws_token(req);

    // Assert
    expect(result).toBe(token);
  });

  /** Verifica que token vacío ("") sea tratado como ausente y lance error */
  it("should_throw_when_token_param_is_empty_string", async () => {
    // Arrange
    // URLSearchParams.get("token") devuelve "" si el param existe pero está vacío;
    // la implementación actual sólo falla si token es null (falsy "").
    const req = make_mock_request("/document/doc-123?token=");

    // Act
    // Un token vacío es falsy — la implementación lanza UnauthorizedError
    await expect(validate_ws_token(req)).rejects.toThrow(UnauthorizedError);
  });
});
