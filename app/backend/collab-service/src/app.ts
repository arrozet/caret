import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { validate_ws_token } from "./middleware/auth_middleware.js";
import { config } from "./lib/config.js";
import { UnauthorizedError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { ConnectionHandler } from "./handlers/index.js";
import { RoomManager } from "./services/room_manager.js";

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
    ws.close(4000, "Invalid route or missing doc_id");
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
 * Factory function for creating a testable collaboration server.
 * Allows tests to inject dependencies and get a fresh server instance.
 *
 * @param options - Configuration options for the server.
 * @returns Object containing the server, wss, room_manager, and connection_handler.
 */
export function create_collaboration_server(options?: {
  port?: number;
  room_manager?: RoomManager;
  connection_handler?: ConnectionHandler;
}) {
  const test_http_server = createServer(handle_http_request);
  const test_wss = new WebSocketServer({ server: test_http_server });
  const test_room_manager = options?.room_manager ?? new RoomManager();
  const test_connection_handler = options?.connection_handler ?? new ConnectionHandler();

  test_wss.on("connection", async (ws, req) => {
    const doc_id = extract_doc_id_from_request_path(req);
    if (!doc_id) {
      ws.close(4000, "Invalid route or missing doc_id");
      return;
    }

    try {
      const auth = await validate_ws_token(req);
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

  return {
    http_server: test_http_server,
    wss: test_wss,
    room_manager: test_room_manager,
    connection_handler: test_connection_handler,
    start: (port?: number) => {
      const listen_port = port ?? options?.port ?? config.PORT;
      test_http_server.listen(listen_port);
      return listen_port;
    },
    stop: () => {
      test_wss.close();
      test_http_server.close();
    },
  };
}

export { wss, http_server, room_manager, connection_handler };
