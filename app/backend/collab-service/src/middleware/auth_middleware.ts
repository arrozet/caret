import type { IncomingMessage } from "http";
import { UnauthorizedError } from "../lib/errors.js";

/**
 * WebSocket JWT authentication guard.
 * Called during the WebSocket handshake before a connection is accepted.
 * Extracts and validates the Supabase JWT from the `token` query parameter:
 *   wss://collab.caret.page/document/{doc_id}?token={supabase_jwt}
 *
 * Throws UnauthorizedError if the token is missing or invalid.
 * The WS server must close the connection (code 4001) on error.
 */
export async function validate_ws_token(req: IncomingMessage): Promise<string> {
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  if (!token) {
    throw new UnauthorizedError("Missing token query parameter");
  }
  // JWT validation against Supabase secret will be implemented here.
  return token;
}
