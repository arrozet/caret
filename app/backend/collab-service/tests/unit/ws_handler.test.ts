import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebSocket as WsType, RawData } from "ws";
import type { IncomingMessage } from "http";
import type { AuthResult } from "../../src/middleware/auth_middleware.js";
import { UnauthorizedError } from "../../src/lib/errors.js";

/**
 * Unit tests for WebSocket connection handling in collab-service.
 * Validates handshake auth, path parsing, and connection close semantics.
 */

vi.mock("../../src/middleware/auth_middleware.js", () => ({
  validateWsToken: vi.fn(),
}));

vi.mock("../../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../src/services/room_manager.js", () => ({
  RoomManager: vi.fn().mockImplementation(() => ({
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    getDoc: vi.fn(),
  })),
}));

vi.mock("../../src/handlers/index.js", () => ({
  ConnectionHandler: vi.fn().mockImplementation(() => ({
    handleConnection: vi.fn(),
  })),
}));

import { validateWsToken } from "../../src/middleware/auth_middleware.js";
import { logger } from "../../src/lib/logger.js";
import { extract_doc_id_from_request_path, handle_ws_connection } from "../../src/app.js";

/**
 * Creates a WebSocket mock with the methods used by handlers.
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
 * Creates an IncomingMessage mock with URL and host.
 */
function make_mock_request(url: string, host = "localhost:3003"): IncomingMessage {
  return {
    url,
    headers: { host },
  } as unknown as IncomingMessage;
}

/**
 * Unit tests for doc_id extraction from the expected route format.
 */
describe("extract_doc_id_from_request_path", () => {
  /** Returns doc_id when route matches /document/{doc_id}. */
  it("should_extract_doc_id_from_valid_document_route", () => {
    // Arrange
    const req = make_mock_request("/document/doc-123?token=ok");

    // Act
    const doc_id = extract_doc_id_from_request_path(req);

    // Assert
    expect(doc_id).toBe("doc-123");
  });

  /** Returns null when route is not under /document/{doc_id}. */
  it("should_return_null_for_invalid_document_route", () => {
    // Arrange
    const req = make_mock_request("/docs/doc-123?token=ok");

    // Act
    const doc_id = extract_doc_id_from_request_path(req);

    // Assert
    expect(doc_id).toBeNull();
  });

  /** Returns null when route misses doc_id segment. */
  it("should_return_null_when_doc_id_is_missing", () => {
    // Arrange
    const req = make_mock_request("/document/?token=ok");

    // Act
    const doc_id = extract_doc_id_from_request_path(req);

    // Assert
    expect(doc_id).toBeNull();
  });

  /** Returns null when URL cannot be parsed. */
  it("should_return_null_when_url_is_malformed", () => {
    // Arrange
    const req = make_mock_request("http://[::1");

    // Act
    const doc_id = extract_doc_id_from_request_path(req);

    // Assert
    expect(doc_id).toBeNull();
  });
});

/**
 * Unit tests for the WebSocket connection handler exported by app.ts.
 */
describe("handle_ws_connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Accepts valid token and route without closing socket. */
  it("should_accept_connection_when_token_is_valid", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-123?token=valid.jwt.token");
    const auth_result: AuthResult = {
      user_id: "user-1",
      doc_id: "doc-123",
      token: "valid.jwt.token",
    };
    vi.mocked(validateWsToken).mockResolvedValue(auth_result);

    // Act
    await handle_ws_connection(mock_ws, req);

    // Assert
    expect(mock_ws.close).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("WebSocket connection accepted", {
      doc_id: "doc-123",
      user_id: "user-1",
    });
  });

  /** Closes with 4001 when token is missing. */
  it("should_close_connection_with_4001_when_token_missing", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-123");
    vi.mocked(validateWsToken).mockRejectedValue(
      new UnauthorizedError("Missing token query parameter"),
    );

    // Act
    await handle_ws_connection(mock_ws, req);

    // Assert
    expect(mock_ws.close).toHaveBeenCalledWith(4001, "Unauthorized");
  });

  /** Closes with 4001 when token is invalid. */
  it("should_close_connection_with_4001_when_token_invalid", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-123?token=bad.token");
    vi.mocked(validateWsToken).mockRejectedValue(new UnauthorizedError("Invalid token"));

    // Act
    await handle_ws_connection(mock_ws, req);

    // Assert
    expect(mock_ws.close).toHaveBeenCalledWith(4001, "Unauthorized");
    expect(logger.info).not.toHaveBeenCalledWith("WebSocket connection accepted", {
      doc_id: "doc-123",
      user_id: expect.any(String),
    });
  });

  /** Calls validate_ws_token with the incoming request. */
  it("should_call_validate_ws_token_with_incoming_request", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-456?token=my.token");
    const auth_result: AuthResult = { user_id: "user-1", doc_id: "doc-456", token: "my.token" };
    vi.mocked(validateWsToken).mockResolvedValue(auth_result);

    // Act
    await handle_ws_connection(mock_ws, req);

    // Assert
    expect(validateWsToken).toHaveBeenCalledOnce();
    expect(validateWsToken).toHaveBeenCalledWith(req);
  });

  /** Closes with 1011 and logs error on unexpected auth errors. */
  it("should_close_connection_with_1011_on_unexpected_error", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-123?token=token");
    const unexpected_error = new Error("DB connection failed");
    vi.mocked(validateWsToken).mockRejectedValue(unexpected_error);

    // Act
    await handle_ws_connection(mock_ws, req);

    // Assert
    expect(mock_ws.close).toHaveBeenCalledWith(1011, "Internal Error");
    expect(logger.error).toHaveBeenCalledWith(
      "Unexpected WebSocket handshake error",
      expect.objectContaining({
        docId: "doc-123",
        error: unexpected_error,
      }),
    );
  });

  /** Logs info once on successful connection. */
  it("should_log_info_exactly_once_on_successful_connection", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-123?token=ok.token");
    const auth_result: AuthResult = { user_id: "user-1", doc_id: "doc-123", token: "ok.token" };
    vi.mocked(validateWsToken).mockResolvedValue(auth_result);

    // Act
    await handle_ws_connection(mock_ws, req);

    // Assert
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  /** Does not log acceptance when connection is rejected. */
  it("should_not_log_info_when_connection_rejected", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/document/doc-123");
    vi.mocked(validateWsToken).mockRejectedValue(new UnauthorizedError());

    // Act
    await handle_ws_connection(mock_ws, req);

    // Assert
    expect(logger.info).not.toHaveBeenCalled();
  });

  /** Closes with 4000 when route is invalid before auth. */
  it("should_close_connection_with_1008_when_route_is_invalid", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("/docs/doc-123?token=valid.jwt.token");

    // Act
    await handle_ws_connection(mock_ws, req);

    // Assert
    expect(validateWsToken).not.toHaveBeenCalled();
    expect(mock_ws.close).toHaveBeenCalledWith(1008, "Invalid route or missing doc_id");
    expect(logger.warn).toHaveBeenCalledWith(
      "WebSocket connection rejected due to invalid route",
      expect.objectContaining({ path: "/docs/doc-123?token=valid.jwt.token" }),
    );
  });

  /** Closes with 1008 when URL is malformed before auth. */
  it("should_close_connection_with_1008_when_url_is_malformed", async () => {
    // Arrange
    const mock_ws = make_mock_ws();
    const req = make_mock_request("http://[::1");

    // Act
    await handle_ws_connection(mock_ws, req);

    // Assert
    expect(validateWsToken).not.toHaveBeenCalled();
    expect(mock_ws.close).toHaveBeenCalledWith(1008, "Invalid route or missing doc_id");
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
