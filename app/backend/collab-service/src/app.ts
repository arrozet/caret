import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { WebSocketServer } from "ws";
import { validate_ws_token } from "./middleware/auth_middleware.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";

/**
 * Collaboration Service entry point.
 * Runs an HTTP server that handles both:
 * - HTTP GET /health  → health check (required by Docker and ECS Fargate)
 * - WebSocket upgrade → Y.js CRDT sync (authenticated via JWT query param)
 * Both on the same port to avoid exposing an extra port on ECS.
 */
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "collab-service" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws, req) => {
  try {
    await validate_ws_token(req);
    // Connection accepted — Y.js sync handler will be wired here.
    logger.info("WebSocket connection established");
  } catch {
    ws.close(4001, "Unauthorized");
  }
});

server.listen(config.PORT, () => {
  logger.info(`Collaboration Service running on port ${config.PORT}`);
});

export default server;
