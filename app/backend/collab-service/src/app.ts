import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { validate_ws_token } from "./middleware/auth_middleware.js";
import { config } from "./lib/config.js";
import { UnauthorizedError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";

/**
 * Collaboration Service entry point.
 * Shared HTTP + WebSocket server on a single port.
 * Authentication is performed at handshake time via JWT query param:
 *   wss://collab.caret.page/document/{doc_id}?token={supabase_jwt}
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

const http_server = createServer(handle_http_request);
const wss = new WebSocketServer({ server: http_server });

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
    await validate_ws_token(req);
    // Connection accepted — Y.js sync handler will be wired here.
    logger.info("WebSocket connection accepted", { doc_id });
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

export default wss;
