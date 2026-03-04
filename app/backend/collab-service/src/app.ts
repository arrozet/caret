import { WebSocketServer } from "ws";
import { validate_ws_token } from "./middleware/auth_middleware.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";

/**
 * Collaboration Service entry point.
 * Pure WebSocket server — no HTTP layer.
 * Authentication is performed at handshake time via JWT query param:
 *   wss://collab.caret.page/document/{doc_id}?token={supabase_jwt}
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
