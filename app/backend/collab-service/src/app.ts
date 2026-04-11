import { createServer, type IncomingMessage, type ServerResponse, type Server } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { validateWsToken, type AuthResult } from "./middleware/auth_middleware.js";
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
export function extractDocIdFromRequestPath(req: IncomingMessage): string | null {
  let pathnameSegments: string[];

  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    pathnameSegments = url.pathname.split("/");
  } catch {
    return null;
  }

  if (pathnameSegments.length !== 3) {
    return null;
  }

  if (pathnameSegments[1] !== "document") {
    return null;
  }

  const docId = pathnameSegments[2];
  if (!docId) {
    return null;
  }

  // Validate percent-encoding is well-formed by attempting to decode
  try {
    decodeURIComponent(docId);
  } catch {
    return null;
  }

  return docId;
}

export { extractDocIdFromRequestPath as extract_doc_id_from_request_path };

/**
 * Handles HTTP requests (primarily for health checks).
 *
 * @param req - The incoming HTTP request.
 * @param res - The outgoing HTTP response.
 */
function handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
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
const httpServer = createServer(handleHttpRequest);

// WebSocket server attached to the HTTP server
const wss = new WebSocketServer({ server: httpServer });

// Shared instances for all connections
const roomManager = new RoomManager();
const connectionHandler = new ConnectionHandler();

/**
 * Handles a new WebSocket connection.
 * Validates the route, authenticates via JWT, and hands off to the ConnectionHandler.
 *
 * @param ws - The WebSocket connection.
 * @param req - The incoming HTTP upgrade request.
 */
export async function handleWsConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const docId = extractDocIdFromRequestPath(req);
  if (!docId) {
    logger.warn("WebSocket connection rejected due to invalid route", {
      path: req.url ?? "",
    });
    ws.close(1008, "Invalid route or missing doc_id");
    return;
  }

  try {
    const auth = await validateWsToken(req);

    // Hand off to ConnectionHandler for Y.js sync
    connectionHandler.handleConnection({
      ws,
      auth,
      roomManager,
    });

    logger.info("WebSocket connection accepted", { doc_id: docId, user_id: auth.user_id });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      ws.close(4001, "Unauthorized");
      return;
    }

    logger.error("Unexpected WebSocket handshake error", {
      docId,
      error,
    });
    ws.close(1011, "Internal Error");
  }
}

wss.on("connection", handleWsConnection);

if (process.env.NODE_ENV !== "test") {
  httpServer.listen(config.PORT, () => {
    logger.info("Collaboration Service started", {
      ws_url: `ws://localhost:${config.PORT}/document/{doc_id}?token={jwt}`,
      health_url: `http://localhost:${config.PORT}/health`,
      port: config.PORT,
    });
  });
}

export { handleWsConnection as handle_ws_connection };

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
  httpServer: Server;
  /** The underlying WebSocket server (for advanced usage). */
  wss: WebSocketServer;
  /** The room manager instance. */
  roomManager: RoomManager;
  /** The connection handler instance. */
  connectionHandler: ConnectionHandler;
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
export async function testAuthValidator(req: IncomingMessage): Promise<AuthResult> {
  const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
  const token = url.searchParams.get("token");

  if (!token) {
    throw new UnauthorizedError("Missing token query parameter");
  }

  // Extract doc_id from path
  const docIdMatch = url.pathname.match(/^\/document\/([^/?]+)/);
  if (!docIdMatch || !docIdMatch[1]) {
    throw new UnauthorizedError("Invalid document path");
  }

  return {
    user_id: `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    doc_id: docIdMatch[1],
    token,
  };
}

export { testAuthValidator as test_auth_validator };

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
export function createCollaborationServer(options?: {
  port?: number;
  roomManager?: RoomManager;
  connectionHandler?: ConnectionHandler;
  authValidator?: AuthValidator;
}): CollaborationServer {
  const testHttpServer = createServer(handleHttpRequest);
  const testWss = new WebSocketServer({ server: testHttpServer });
  const testRoomManager = options?.roomManager ?? new RoomManager();
  const testConnectionHandler = options?.connectionHandler ?? new ConnectionHandler();
  const authValidator = options?.authValidator ?? testAuthValidator;

  testWss.on("connection", async (ws, req) => {
    const docId = extractDocIdFromRequestPath(req);
    if (!docId) {
      ws.close(1008, "Invalid route or missing doc_id");
      return;
    }

    try {
      const auth = await authValidator(req);
      testConnectionHandler.handleConnection({
        ws,
        auth,
        roomManager: testRoomManager,
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
  const listenPort = options?.port ?? 0;
  if (listenPort !== undefined) {
    testHttpServer.listen(listenPort);
  }

  return {
    address: () => testHttpServer.address() as AddressInfo | null,
    once: (event: "listening", listener: () => void) => {
      testHttpServer.once(event, listener);
    },
    off: (event: "listening", listener: () => void) => {
      testHttpServer.off(event, listener);
    },
    close: (callback?: () => void) => {
      testWss.close(() => {
        testHttpServer.close(callback);
      });
    },
    httpServer: testHttpServer,
    wss: testWss,
    roomManager: testRoomManager,
    connectionHandler: testConnectionHandler,
  };
}

export { createCollaborationServer as create_collaboration_server };

export { wss, httpServer, roomManager, connectionHandler };
