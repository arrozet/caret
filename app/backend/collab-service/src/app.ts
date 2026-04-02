import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import * as Y from "yjs";
import * as sync_protocol from "y-protocols/sync";
import * as awareness_protocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { validate_ws_token } from "./middleware/auth_middleware.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";

/**
 * Collaboration Service entry point.
 * Exposes local and production runtime for Y.js collaboration over WebSocket.
 */
export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;

type CollaborationRoom = {
  doc_id: string;
  y_doc: Y.Doc;
  awareness: awareness_protocol.Awareness;
  clients: Set<WebSocket>;
  awareness_clients_by_ws: Map<WebSocket, Set<number>>;
  dispose: () => void;
};

const rooms_by_doc_id = new Map<string, CollaborationRoom>();

/**
 * Creates the WebSocket collaboration server bound to a given port.
 */
export function create_collaboration_server(options: { port: number }): WebSocketServer {
  const wss = new WebSocketServer({ port: options.port });

  wss.on("connection", async (ws, req) => {
    try {
      await validate_ws_token(req);
    } catch {
      ws.close(4001, "Unauthorized");
      return;
    }

    const doc_id = parse_document_id_from_request(req);
    if (!doc_id) {
      ws.close(1008, "Invalid document path");
      return;
    }

    const room = get_or_create_room(doc_id);
    room.clients.add(ws);
    room.awareness_clients_by_ws.set(ws, new Set<number>());
    logger.info(`WebSocket connection established for doc_id=${doc_id}`);

    send_sync_step_1(ws, room.y_doc);

    ws.on("message", (raw_payload) => {
      try {
        handle_client_message(room, ws, to_uint8_array(raw_payload));
      } catch (error) {
        logger.warn("Malformed websocket protocol frame received", {
          doc_id,
          error: error instanceof Error ? error.message : String(error),
        });
        ws.close(1002, "Protocol error");
      }
    });

    ws.on("close", () => {
      handle_client_disconnect(room, ws);
    });
  });

  return wss;
}

/**
 * Parses the collaboration document id from ws request URL path.
 */
function parse_document_id_from_request(req: IncomingMessage): string | null {
  try {
    const parsed_url = new URL(req.url ?? "", "http://localhost");
    const match = /^\/document\/([^/]+)$/.exec(parsed_url.pathname);
    if (!match) {
      return null;
    }

    const doc_id = decodeURIComponent(match[1] ?? "").trim();
    return doc_id.length > 0 ? doc_id : null;
  } catch {
    return null;
  }
}

/**
 * Gets an existing room or creates a new in-memory collaboration room.
 */
function get_or_create_room(doc_id: string): CollaborationRoom {
  const existing_room = rooms_by_doc_id.get(doc_id);
  if (existing_room) {
    return existing_room;
  }

  const y_doc = new Y.Doc();
  const awareness = new awareness_protocol.Awareness(y_doc);
  const clients = new Set<WebSocket>();
  const awareness_clients_by_ws = new Map<WebSocket, Set<number>>();

  const on_y_doc_update = (update: Uint8Array, origin: unknown): void => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    sync_protocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    for (const client of clients) {
      if (origin === client) {
        continue;
      }
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  const on_awareness_update = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin instanceof WebSocket) {
      const tracked_client_ids = awareness_clients_by_ws.get(origin);
      if (tracked_client_ids) {
        for (const client_id of changes.added) {
          tracked_client_ids.add(client_id);
        }
        for (const client_id of changes.updated) {
          tracked_client_ids.add(client_id);
        }
        for (const client_id of changes.removed) {
          tracked_client_ids.delete(client_id);
        }
      }
    }

    const changed_client_ids = [...changes.added, ...changes.updated, ...changes.removed];
    if (changed_client_ids.length === 0) {
      return;
    }

    const awareness_update = awareness_protocol.encodeAwarenessUpdate(
      awareness,
      changed_client_ids,
    );
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awareness_update);
    const message = encoding.toUint8Array(encoder);

    for (const client of clients) {
      if (origin === client) {
        continue;
      }
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  y_doc.on("update", on_y_doc_update);
  awareness.on("update", on_awareness_update);

  const room: CollaborationRoom = {
    doc_id,
    y_doc,
    awareness,
    clients,
    awareness_clients_by_ws,
    dispose: () => {
      y_doc.off("update", on_y_doc_update);
      awareness.off("update", on_awareness_update);
      awareness.destroy();
      y_doc.destroy();
    },
  };

  rooms_by_doc_id.set(doc_id, room);
  return room;
}

/**
 * Sends the initial sync-step-1 message to a newly connected client.
 */
function send_sync_step_1(ws: WebSocket, y_doc: Y.Doc): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  sync_protocol.writeSyncStep1(encoder, y_doc);
  ws.send(encoding.toUint8Array(encoder));
}

/**
 * Handles one incoming protocol message from a client socket.
 */
function handle_client_message(room: CollaborationRoom, ws: WebSocket, payload: Uint8Array): void {
  const decoder = decoding.createDecoder(payload);
  const message_type = decoding.readVarUint(decoder);

  if (message_type === MESSAGE_SYNC) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    sync_protocol.readSyncMessage(decoder, encoder, room.y_doc, ws);
    if (encoding.length(encoder) > 1 && ws.readyState === WebSocket.OPEN) {
      ws.send(encoding.toUint8Array(encoder));
    }
    return;
  }

  if (message_type === MESSAGE_AWARENESS) {
    const awareness_update = decoding.readVarUint8Array(decoder);
    awareness_protocol.applyAwarenessUpdate(room.awareness, awareness_update, ws);
  }
}

/**
 * Handles client disconnect, awareness cleanup, and room disposal when empty.
 */
function handle_client_disconnect(room: CollaborationRoom, ws: WebSocket): void {
  room.clients.delete(ws);

  const tracked_client_ids = room.awareness_clients_by_ws.get(ws);
  room.awareness_clients_by_ws.delete(ws);
  if (tracked_client_ids && tracked_client_ids.size > 0) {
    awareness_protocol.removeAwarenessStates(room.awareness, [...tracked_client_ids], ws);
  }

  if (room.clients.size === 0) {
    rooms_by_doc_id.delete(room.doc_id);
    room.dispose();
  }
}

/**
 * Converts raw ws payload into Uint8Array for protocol decoding.
 */
function to_uint8_array(raw_payload: unknown): Uint8Array {
  if (raw_payload instanceof Uint8Array) {
    return raw_payload;
  }
  if (Array.isArray(raw_payload)) {
    const joined_buffer = Buffer.concat(raw_payload as Buffer[]);
    return new Uint8Array(joined_buffer.buffer, joined_buffer.byteOffset, joined_buffer.byteLength);
  }
  const buffer = Buffer.from(raw_payload as ArrayBufferLike);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

const should_start_default_server = process.env.NODE_ENV !== "test";
const wss = should_start_default_server ? create_collaboration_server({ port: config.PORT }) : null;

if (wss) {
  logger.info(`Collaboration Service WebSocket server running on port ${config.PORT}`);
}

export default wss;
