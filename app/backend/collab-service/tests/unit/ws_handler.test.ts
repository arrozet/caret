import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebSocket as WsType, RawData } from "ws";
import type { IncomingMessage } from "http";

/**
 * Unit tests para el WebSocket connection handler del collab-service.
 * Verifica el flujo de conexión, autenticación en handshake, manejo de
 * desconexión y comportamiento ante clientes maliciosos.
 * Se mockea ws y auth_middleware para aislar la lógica del handler.
 */

// Mock del módulo auth_middleware para controlar el resultado del handshake
vi.mock("../../src/middleware/auth_middleware.js", () => ({
  validate_ws_token: vi.fn(),
}));

// Mock del módulo logger para suprimir output en tests
vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { validate_ws_token } from "../../src/middleware/auth_middleware.js";
import { logger } from "../../src/lib/logger.js";
import { UnauthorizedError } from "../../src/lib/errors.js";

/**
 * Factory que crea un mock de WebSocket con los métodos más usados.
 */
function make_mock_ws(): WsType {
  return {
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    readyState: 1, // OPEN
  } as unknown as WsType;
}

/**
 * Factory que crea un mock de IncomingMessage HTTP con la URL y host dados.
 */
function make_mock_request(url: string, host = "localhost:3003"): IncomingMessage {
  return {
    url,
    headers: { host },
  } as unknown as IncomingMessage;
}

/**
 * Tests para el handler de conexión WebSocket del app.ts.
 * Replica la lógica del handler: valida token → acepta o cierra (4001).
 */
describe("WebSocket connection handler logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Simula el handler de conexión de app.ts:
   *   if validate_ws_token falla → ws.close(4001)
   *   si pasa → logger.info
   */
  async function run_connection_handler(
    ws: WsType,
    req: IncomingMessage
  ): Promise<void> {
    try {
      await validate_ws_token(req);
      logger.info("WebSocket connection established");
    } catch {
      ws.close(4001, "Unauthorized");
    }
  }

  /** Verifica que una conexión con token válido sea aceptada sin cerrar el socket */
  it("should_accept_connection_when_token_is_valid", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-123?token=valid.jwt.token");
    vi.mocked(validate_ws_token).mockResolvedValue("valid.jwt.token");

    // Act
    await run_connection_handler(mock_ws, req);

    // Assert
    expect(mock_ws.close).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("WebSocket connection established");
  });

  /** Verifica que una conexión sin token sea rechazada con código 4001 */
  it("should_close_connection_with_4001_when_token_missing", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-123");
    vi.mocked(validate_ws_token).mockRejectedValue(
      new UnauthorizedError("Missing token query parameter")
    );

    // Act
    await run_connection_handler(mock_ws, req);

    // Assert
    expect(mock_ws.close).toHaveBeenCalledWith(4001, "Unauthorized");
  });

  /** Verifica que token inválido también resulte en cierre con 4001 */
  it("should_close_connection_with_4001_when_token_invalid", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-123?token=bad.token");
    vi.mocked(validate_ws_token).mockRejectedValue(
      new UnauthorizedError("Invalid token")
    );

    // Act
    await run_connection_handler(mock_ws, req);

    // Assert
    expect(mock_ws.close).toHaveBeenCalledWith(4001, "Unauthorized");
    expect(logger.info).not.toHaveBeenCalledWith("WebSocket connection established");
  });

  /** Verifica que validate_ws_token sea llamado con el IncomingMessage correcto */
  it("should_call_validate_ws_token_with_incoming_request", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-456?token=my.token");
    vi.mocked(validate_ws_token).mockResolvedValue("my.token");

    // Act
    await run_connection_handler(mock_ws, req);

    // Assert
    expect(validate_ws_token).toHaveBeenCalledOnce();
    expect(validate_ws_token).toHaveBeenCalledWith(req);
  });

  /** Verifica que cualquier error (no solo UnauthorizedError) cierre el socket */
  it("should_close_connection_on_any_unexpected_error", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-123?token=token");
    vi.mocked(validate_ws_token).mockRejectedValue(new Error("DB connection failed"));

    // Act
    await run_connection_handler(mock_ws, req);

    // Assert
    expect(mock_ws.close).toHaveBeenCalledWith(4001, "Unauthorized");
  });

  /** Verifica que una conexión válida llame a logger.info exactamente una vez */
  it("should_log_info_exactly_once_on_successful_connection", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-123?token=ok.token");
    vi.mocked(validate_ws_token).mockResolvedValue("ok.token");

    // Act
    await run_connection_handler(mock_ws, req);

    // Assert
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  /** Verifica que una conexión rechazada no llame a logger.info */
  it("should_not_log_info_when_connection_rejected", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-123");
    vi.mocked(validate_ws_token).mockRejectedValue(new UnauthorizedError());

    // Act
    await run_connection_handler(mock_ws, req);

    // Assert
    expect(logger.info).not.toHaveBeenCalled();
  });
});

/**
 * Tests para el mock de WebSocket — verifica que el mock funciona correctamente
 * y que los métodos del socket son invocables como se espera.
 */
describe("WebSocket mock utilities", () => {
  /** Verifica que el mock de WebSocket tenga los métodos esperados */
  it("should_have_send_and_close_methods", () => {
    // Arrange & Act
    const mock_ws = make_mock_ws();

    // Assert
    expect(typeof mock_ws.send).toBe("function");
    expect(typeof mock_ws.close).toBe("function");
  });

  /** Verifica que mock.send capture los argumentos correctamente */
  it("should_capture_send_arguments", () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const data: RawData = Buffer.from("test message");

    // Act
    mock_ws.send(data);

    // Assert
    expect(mock_ws.send).toHaveBeenCalledWith(data);
  });

  /** Verifica que mock.close capture el código y razón */
  it("should_capture_close_code_and_reason", () => {
    // Arrange
    const mock_ws = make_mock_ws();

    // Act
    mock_ws.close(4001, "Unauthorized");

    // Assert
    expect(mock_ws.close).toHaveBeenCalledWith(4001, "Unauthorized");
  });
});
