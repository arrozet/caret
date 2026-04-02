import { createServer, type IncomingMessage, type ServerResponse, type Server } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { validate_ws_token, type AuthResult } from "./middleware/auth_middleware.js";
import { config } from "./lib/config.js";
import { UnauthorizedError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { ConnectionHandler } from "./handlers/index.js";
import { RoomManager } from "./services/room_manager.js";

/**
 * Y.js protocol message type constants.
 * Used for encoding/decoding sync and awareness messages.
 */
export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;

/**
 * Type for custom auth validator function.
 * Used by tests to provide mock authentication.
 */
export type AuthValidator = (req: IncomingMessage) => Promise<AuthResult>;

/**
 * Collaboration Service entry point.
 * Shared HTTP + WebSocket server on a single port.
 * Authentication is performed at handshake time via JWT query param:
 *   wss://collab.caret.page/document/{doc_id}?token={supabase_jwt}
 */

/**
 * Extracts the document ID from the WebSocket connection request path.
 * Expected format: /document/{doc_id}
 *
 * @param req - The incoming HTTP request from the WebSocket upgrade.
 * @returns The document ID if the path is valid, null otherwise.
 */
export function extract_doc_id_from_request_path(req: IncomingMessage): string | null {
  let pathname_segments: string[];

  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    pathname_segments = url.pathname.split("/");
  } catch {
    return null;
  }

  if (pathname_segments.length !== 3) {
    return null;
  }

  if (pathname_segments[1] !== "document") {
    return null;
  }

  const doc_id = pathname_segments[2];
  if (!doc_id) {
    return null;
  }

  // Validate percent-encoding is well-formed by attempting to decode
  try {
    decodeURIComponent(doc_id);
  } catch {
    return null;
  }

  return doc_id;
}

/**
 * Handles HTTP requests (primarily for health checks).
 *
 * @param req - The incoming HTTP request.
 * @param res - The outgoing HTTP response.
 */
function handle_http_request(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
}

// HTTP server for health checks
const http_server = createServer(handle_http_request);

// WebSocket server attached to the HTTP server
const wss = new WebSocketServer({ server: http_server });

// Shared instances for all connections
const room_manager = new RoomManager();
const connection_handler = new ConnectionHandler();

/**
 * Handles a new WebSocket connection.
 * Validates the route, authenticates via JWT, and hands off to the ConnectionHandler.
 *
 * @param ws - The WebSocket connection.
 * @param req - The incoming HTTP upgrade request.
 */
export async function handle_ws_connection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const doc_id = extract_doc_id_from_request_path(req);
  if (!doc_id) {
    logger.warn("WebSocket connection rejected due to invalid route", {
      path: req.url ?? "",
    });
    ws.close(1008, "Invalid route or missing doc_id");
    return;
  }

  try {
    const auth = await validate_ws_token(req);

    // Hand off to ConnectionHandler for Y.js sync
    connection_handler.handle_connection({
      ws,
      auth,
      room_manager,
    });

    logger.info("WebSocket connection accepted", { doc_id, user_id: auth.user_id });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      ws.close(4001, "Unauthorized");
      return;
    }

    logger.error("Unexpected WebSocket handshake error", {
      doc_id,
      error,
    });
    ws.close(1011, "Internal Error");
  }
}

wss.on("connection", handle_ws_connection);

if (process.env.NODE_ENV !== "test") {
  http_server.listen(config.PORT, () => {
    logger.info("Collaboration Service started", {
      ws_url: `ws://localhost:${config.PORT}/document/{doc_id}?token={jwt}`,
      health_url: `http://localhost:${config.PORT}/health`,
      port: config.PORT,
    });
  });
}

/**
 * Interface for the collaboration server returned by the factory.
 * Provides a test-compatible API that mirrors WebSocketServer behavior
 * while delegating to the underlying HTTP server.
 */
export interface CollaborationServer {
  /** Returns the server's bound address info, or null if not listening. */
  address(): AddressInfo | null;
  /** Registers a one-time listener for the specified event. */
  once(event: "listening", listener: () => void): void;
  /** Removes a listener for the specified event. */
  off(event: "listening", listener: () => void): void;
  /** Closes the server and invokes the callback when done. */
  close(callback?: () => void): void;
  /** The underlying HTTP server (for advanced usage). */
  http_server: Server;
  /** The underlying WebSocket server (for advanced usage). */
  wss: WebSocketServer;
  /** The room manager instance. */
  room_manager: RoomManager;
  /** The connection handler instance. */
  connection_handler: ConnectionHandler;
}

/**
 * Test-friendly auth validator that accepts any token.
 * Extracts user_id from token or generates a random one.
 * Used by integration tests that don't need real JWT validation.
 *
 * @param req - Incoming HTTP request
 * @returns AuthResult with extracted doc_id and generated user_id
 * @throws UnauthorizedError if token is missing
 */
export async function test_auth_validator(req: IncomingMessage): Promise<AuthResult> {
  const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const token = url.searchParams.get("token");

  if (!token) {
    throw new UnauthorizedError("Missing token query parameter");
  }

  // Extract doc_id from path
  const doc_id_match = url.pathname.match(/^\/document\/([^/?]+)/);
  if (!doc_id_match || !doc_id_match[1]) {
    throw new UnauthorizedError("Invalid document path");
  }

  return {
    user_id: `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    doc_id: doc_id_match[1],
    token,
  };
}

/**
 * Factory function for creating a testable collaboration server.
 * Allows tests to inject dependencies and get a fresh server instance.
 *
 * The returned object provides a test-compatible interface that mirrors
 * WebSocketServer behavior (address, once, off, close) while delegating
 * to the underlying HTTP server.
 *
 * @param options - Configuration options for the server.
 * @param options.port - Port to listen on (default: 0 for random port)
 * @param options.room_manager - Custom RoomManager instance
 * @param options.connection_handler - Custom ConnectionHandler instance
 * @param options.auth_validator - Custom auth validator (default: test_auth_validator for test-friendly behavior)
 * @returns A CollaborationServer with test-compatible API.
 */
export function create_collaboration_server(options?: {
  port?: number;
  room_manager?: RoomManager;
  connection_handler?: ConnectionHandler;
  auth_validator?: AuthValidator;
}): CollaborationServer {
  const test_http_server = createServer(handle_http_request);
  const test_wss = new WebSocketServer({ server: test_http_server });
  const test_room_manager = options?.room_manager ?? new RoomManager();
  const test_connection_handler = options?.connection_handler ?? new ConnectionHandler();
  // Default to test_auth_validator for backward compatibility with tests
  const auth_validator = options?.auth_validator ?? test_auth_validator;

  test_wss.on("connection", async (ws, req) => {
    const doc_id = extract_doc_id_from_request_path(req);
    if (!doc_id) {
      ws.close(1008, "Invalid route or missing doc_id");
      return;
    }

    try {
      const auth = await auth_validator(req);
      test_connection_handler.handle_connection({
        ws,
        auth,
        room_manager: test_room_manager,
      });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        ws.close(4001, "Unauthorized");
        return;
      }
      ws.close(1011, "Internal Error");
    }
  });

  // Start listening immediately if port is provided
  const listen_port = options?.port ?? 0;
  if (listen_port !== undefined) {
    test_http_server.listen(listen_port);
  }

  return {
    address: () => test_http_server.address() as AddressInfo | null,
    once: (event: "listening", listener: () => void) => {
      test_http_server.once(event, listener);
    },
    off: (event: "listening", listener: () => void) => {
      test_http_server.off(event, listener);
    },
    close: (callback?: () => void) => {
      test_wss.close(() => {
        test_http_server.close(callback);
      });
    },
    http_server: test_http_server,
    wss: test_wss,
    room_manager: test_room_manager,
    connection_handler: test_connection_handler,
  };
}

export { wss, http_server, room_manager, connection_handler };
