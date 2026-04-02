import { WebSocketServer } from "ws";
import { validate_ws_token } from "./middleware/auth_middleware.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { ConnectionHandler } from "./handlers/index.js";
import { RoomManager } from "./services/room_manager.js";

/**
 * Collaboration Service entry point.
 * Pure WebSocket server — no HTTP layer.
 * Authentication is performed at handshake time via JWT query param:
 *   wss://collab.caret.page/document/{doc_id}?token={supabase_jwt}
 */
const wss = new WebSocketServer({ port: config.PORT });

// Shared instances for all connections
const room_manager = new RoomManager();
const connection_handler = new ConnectionHandler();

wss.on("connection", async (ws, req) => {
  try {
    const auth = await validate_ws_token(req);

    // Hand off to ConnectionHandler for Y.js sync
    connection_handler.handle_connection({
      ws,
      auth,
      room_manager,
    });
  } catch {
    ws.close(4001, "Unauthorized");
  }
});

logger.info(`Collaboration Service WebSocket server running on port ${config.PORT}`);

export { wss, room_manager, connection_handler };
