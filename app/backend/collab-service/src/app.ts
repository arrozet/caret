import { WebSocketServer } from "ws";
import { validate_ws_token } from "./middleware/auth_middleware.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";

/**
 * Collaboration Service entry point.
 * Runs a raw WebSocket server (not HTTP/REST) on ECS Fargate.
 * Authentication happens at handshake time via JWT query param.
 * Y.js CRDT sync is handled by the Service layer once the connection is established.
 */
const wss = new WebSocketServer({ port: config.PORT });

wss.on("connection", async (ws, req) => {
  try {
    await validate_ws_token(req);
    // Connection accepted — Y.js sync handler will be wired here.
    logger.info("WebSocket connection established");
  } catch {
    ws.close(4001, "Unauthorized");
  }
});

logger.info(`Collaboration Service WebSocket server running on port ${config.PORT}`);

export default wss;
