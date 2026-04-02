/**
 * WebSocket connection handler for Y.js document synchronization.
 * Manages the full Y.js sync protocol including:
 * - Initial sync (step1/step2) for document state exchange
 * - Incremental updates for real-time collaboration
 * - Awareness protocol for user presence/cursor tracking
 *
 * Protocol reference: https://github.com/yjs/y-protocols
 */

import type { WebSocket, RawData } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { RoomManager } from "../services/room_manager.js";
import type { AuthResult } from "../middleware/auth_middleware.js";
import { logger } from "../lib/logger.js";

/** Message type: Y.js sync protocol messages (step1, step2, update) */
const MESSAGE_SYNC = 0;

/** Message type: Awareness protocol messages (user presence, cursors) */
const MESSAGE_AWARENESS = 1;

/**
 * Context object containing all connection dependencies.
 * Passed to handler methods for consistent access to connection state.
 */
export interface ConnectionContext {
  /** The WebSocket connection instance */
  ws: WebSocket;
  /** Authenticated user and document information */
  auth: AuthResult;
  /** Room manager for document and participant management */
  room_manager: RoomManager;
}

/**
 * Manages WebSocket connections for Y.js real-time collaboration.
 * Handles the complete lifecycle of a connection: join, sync, update, leave.
 *
 * Each document has an associated Y.Doc and Awareness instance.
 * Multiple clients can connect to the same document and receive
 * synchronized updates via the Y.js CRDT protocol.
 */
export class ConnectionHandler {
  /**
   * Tracks WebSocket connections per room for broadcasting.
   * Outer map: document_id -> inner map
   * Inner map: user_id -> WebSocket
   */
  private room_sockets: Map<string, Map<string, WebSocket>> = new Map();

  /**
   * Tracks Awareness instances per document for presence/cursor sync.
   * Key: document_id, Value: Awareness instance
   */
  private awareness_map: Map<string, awarenessProtocol.Awareness> = new Map();

  /**
   * Handles a new WebSocket connection after authentication.
   * Sets up message handlers, joins the room, and initiates sync.
   *
   * @param ctx - Connection context with WebSocket, auth, and room_manager
   */
  handle_connection(ctx: ConnectionContext): void {
    const { ws, auth, room_manager } = ctx;
    const { user_id, doc_id } = auth;

    // Generate unique socket_id for this connection
    const socket_id = `${user_id}_${Date.now()}`;

    // Join the room (creates room and Y.Doc if needed)
    room_manager.join_room(doc_id, user_id, socket_id);

    // Track socket for broadcasting
    this.track_socket(doc_id, user_id, ws);

    // Get or create awareness for this document
    const doc = room_manager.get_doc(doc_id);
    if (!doc) {
      logger.error("Failed to get Y.Doc after joining room", { doc_id, user_id });
      ws.close(4500, "Internal server error");
      return;
    }

    const awareness = this.get_or_create_awareness(doc_id, doc);

    // Set initial awareness state for this user
    awareness.setLocalStateField("user", {
      user_id,
      connected_at: Date.now(),
    });

    logger.info("Client joined room", {
      doc_id,
      user_id,
      socket_id,
      participant_count: room_manager.get_participant_count(doc_id),
    });

    // Send initial sync step 1 to the client
    this.send_sync_step1(ws, doc);

    // Send current awareness states to the new client
    this.send_awareness_states(ws, awareness);

    // Set up message handler
    ws.on("message", (data: RawData) => {
      try {
        const close_code = this.handle_message(ctx, data, awareness);
        if (close_code !== null) {
          ws.close(close_code, "Protocol error");
        }
      } catch (error) {
        logger.error("Error handling message", {
          doc_id,
          user_id,
          error: error instanceof Error ? error.message : String(error),
        });
        ws.close(1002, "Protocol error");
      }
    });

    // Set up close handler
    ws.on("close", (code, reason) => {
      this.handle_close(ctx, awareness);
      logger.info("Client disconnected", {
        doc_id,
        user_id,
        code,
        reason: reason.toString(),
      });
    });

    // Set up error handler
    ws.on("error", (error) => {
      logger.error("WebSocket error", {
        doc_id,
        user_id,
        error: error.message,
      });
      this.handle_close(ctx, awareness);
    });
  }

  /**
   * Processes incoming WebSocket messages.
   * Dispatches to sync or awareness handlers based on message type.
   *
   * @param ctx - Connection context
   * @param data - Raw message data (binary)
   * @param awareness - Awareness instance for the document
   * @returns Close code if connection should be closed due to protocol error, null otherwise
   */
  private handle_message(
    ctx: ConnectionContext,
    data: RawData,
    awareness: awarenessProtocol.Awareness,
  ): number | null {
    const { auth, room_manager } = ctx;
    const { user_id, doc_id } = auth;

    // Convert RawData to Uint8Array
    const message = this.to_uint8_array(data);
    if (message.length === 0) {
      // Empty message is a protocol violation
      return 1002;
    }

    const decoder = decoding.createDecoder(message);
    const message_type = decoding.readVarUint(decoder);

    const doc = room_manager.get_doc(doc_id);
    if (!doc) {
      logger.warn("Received message for non-existent room", { doc_id, user_id });
      return null;
    }

    switch (message_type) {
      case MESSAGE_SYNC:
        this.handle_sync_message(ctx, decoder, doc);
        break;

      case MESSAGE_AWARENESS:
        this.handle_awareness_message(ctx, decoder, awareness);
        break;

      default:
        logger.warn("Unknown message type", { message_type, doc_id, user_id });
    }

    return null;
  }

  /**
   * Handles Y.js sync protocol messages.
   * Processes sync step 1, step 2, and update messages.
   *
   * @param ctx - Connection context
   * @param decoder - lib0 decoder positioned after message type
   * @param doc - Y.Doc instance for the room
   */
  private handle_sync_message(ctx: ConnectionContext, decoder: decoding.Decoder, doc: Y.Doc): void {
    const { ws, auth } = ctx;
    const { user_id, doc_id } = auth;

    // Create encoder for response
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);

    // Read and process sync message, potentially writing response
    const sync_message_type = syncProtocol.readSyncMessage(decoder, encoder, doc, null);

    // If sync produced a response (step2 or update), send it
    if (encoding.length(encoder) > 1) {
      const response = encoding.toUint8Array(encoder);
      this.send_message(ws, response);
    }

    // If this was an update (sync message type 2), broadcast to other peers
    // sync_message_type: 0 = step1, 1 = step2, 2 = update
    if (sync_message_type === 2) {
      // Re-encode the update for broadcasting
      const update_encoder = encoding.createEncoder();
      encoding.writeVarUint(update_encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(update_encoder, Y.encodeStateAsUpdate(doc));

      const broadcast_message = encoding.toUint8Array(update_encoder);
      this.broadcast_to_room(doc_id, user_id, broadcast_message);
    }
  }

  /**
   * Handles awareness protocol messages for user presence.
   * Updates awareness state and broadcasts to other peers.
   *
   * @param ctx - Connection context
   * @param decoder - lib0 decoder positioned after message type
   * @param awareness - Awareness instance for the document
   */
  private handle_awareness_message(
    ctx: ConnectionContext,
    decoder: decoding.Decoder,
    awareness: awarenessProtocol.Awareness,
  ): void {
    const { auth } = ctx;
    const { user_id, doc_id } = auth;

    // Apply awareness update
    const update = decoding.readVarUint8Array(decoder);
    awarenessProtocol.applyAwarenessUpdate(awareness, update, null);

    // Broadcast awareness update to other peers
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, update);

    const broadcast_message = encoding.toUint8Array(encoder);
    this.broadcast_to_room(doc_id, user_id, broadcast_message);
  }

  /**
   * Cleans up when a connection closes.
   * Removes participant from room and socket tracking, updates awareness.
   *
   * @param ctx - Connection context
   * @param awareness - Awareness instance for the document
   */
  private handle_close(ctx: ConnectionContext, awareness: awarenessProtocol.Awareness): void {
    const { auth, room_manager } = ctx;
    const { user_id, doc_id } = auth;

    // Remove awareness state for this user
    awarenessProtocol.removeAwarenessStates(awareness, [awareness.clientID], null);

    // Remove socket from tracking
    this.untrack_socket(doc_id, user_id);

    // Leave the room
    room_manager.leave_room(doc_id, user_id);

    // Broadcast awareness removal to remaining peers
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, [awareness.clientID]),
    );

    const broadcast_message = encoding.toUint8Array(encoder);
    this.broadcast_to_room(doc_id, user_id, broadcast_message);

    // Clean up awareness if room is empty
    if (!room_manager.room_exists(doc_id)) {
      this.awareness_map.delete(doc_id);
      logger.debug("Room destroyed, awareness cleaned up", { doc_id });
    }
  }

  /**
   * Broadcasts a message to all peers in a room except the sender.
   *
   * @param doc_id - Document/room identifier
   * @param sender_id - User ID of the sender (excluded from broadcast)
   * @param message - Binary message to broadcast
   */
  private broadcast_to_room(doc_id: string, sender_id: string, message: Uint8Array): void {
    const room_map = this.room_sockets.get(doc_id);
    if (!room_map) {
      return;
    }

    for (const [user_id, socket] of room_map) {
      if (user_id !== sender_id) {
        this.send_message(socket, message);
      }
    }
  }

  /**
   * Sends initial sync step 1 to a newly connected client.
   * This sends the server's state vector so the client can
   * determine what updates it needs.
   *
   * @param ws - WebSocket to send to
   * @param doc - Y.Doc to sync
   */
  private send_sync_step1(ws: WebSocket, doc: Y.Doc): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);

    const message = encoding.toUint8Array(encoder);
    this.send_message(ws, message);
  }

  /**
   * Sends current awareness states to a newly connected client.
   *
   * @param ws - WebSocket to send to
   * @param awareness - Awareness instance with current states
   */
  private send_awareness_states(ws: WebSocket, awareness: awarenessProtocol.Awareness): void {
    const clients = Array.from(awareness.getStates().keys());
    if (clients.length === 0) {
      return;
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, clients),
    );

    const message = encoding.toUint8Array(encoder);
    this.send_message(ws, message);
  }

  /**
   * Gets or creates an Awareness instance for a document.
   *
   * @param doc_id - Document identifier
   * @param doc - Y.Doc to attach awareness to
   * @returns Awareness instance
   */
  private get_or_create_awareness(doc_id: string, doc: Y.Doc): awarenessProtocol.Awareness {
    let awareness = this.awareness_map.get(doc_id);
    if (!awareness) {
      awareness = new awarenessProtocol.Awareness(doc);
      this.awareness_map.set(doc_id, awareness);
    }
    return awareness;
  }

  /**
   * Tracks a socket for a user in a room.
   *
   * @param doc_id - Document/room identifier
   * @param user_id - User identifier
   * @param ws - WebSocket to track
   */
  private track_socket(doc_id: string, user_id: string, ws: WebSocket): void {
    if (!this.room_sockets.has(doc_id)) {
      this.room_sockets.set(doc_id, new Map());
    }
    this.room_sockets.get(doc_id)!.set(user_id, ws);
  }

  /**
   * Removes a socket from tracking.
   *
   * @param doc_id - Document/room identifier
   * @param user_id - User identifier
   */
  private untrack_socket(doc_id: string, user_id: string): void {
    const room_map = this.room_sockets.get(doc_id);
    if (room_map) {
      room_map.delete(user_id);
      if (room_map.size === 0) {
        this.room_sockets.delete(doc_id);
      }
    }
  }

  /**
   * Safely sends a message to a WebSocket.
   * Checks if socket is open before sending.
   *
   * @param ws - WebSocket to send to
   * @param message - Binary message to send
   */
  private send_message(ws: WebSocket, message: Uint8Array): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }

  /**
   * Converts RawData to Uint8Array.
   * Handles Buffer, ArrayBuffer, and Buffer[] inputs.
   *
   * @param data - Raw WebSocket data
   * @returns Uint8Array representation
   */
  private to_uint8_array(data: RawData): Uint8Array {
    if (data instanceof Buffer) {
      return new Uint8Array(data);
    }
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (Array.isArray(data)) {
      // Buffer[] - concatenate
      return new Uint8Array(Buffer.concat(data));
    }
    return new Uint8Array();
  }

  /**
   * Returns the number of active rooms being tracked.
   * Useful for monitoring and debugging.
   *
   * @returns Count of rooms with active sockets
   */
  get_active_room_count(): number {
    return this.room_sockets.size;
  }

  /**
   * Returns the number of sockets in a specific room.
   * Useful for monitoring and debugging.
   *
   * @param doc_id - Document/room identifier
   * @returns Count of active sockets in the room
   */
  get_room_socket_count(doc_id: string): number {
    return this.room_sockets.get(doc_id)?.size ?? 0;
  }
}
