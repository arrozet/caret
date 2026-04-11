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
  roomManager: RoomManager;
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
  private roomSockets: Map<string, Map<string, WebSocket>> = new Map();

  /**
   * Tracks Awareness instances per document for presence/cursor sync.
   * Key: document_id, Value: Awareness instance
   */
  private awarenessMap: Map<string, awarenessProtocol.Awareness> = new Map();

  /**
   * Handles a new WebSocket connection after authentication.
   * Sets up message handlers, joins the room, and initiates sync.
   *
   * @param ctx - Connection context with WebSocket, auth, and room_manager
   */
  handleConnection(ctx: ConnectionContext): void {
    const { ws, auth } = ctx;
    const roomManager =
      ctx.roomManager ?? (ctx as ConnectionContext & { room_manager?: RoomManager }).room_manager;
    if (!roomManager) {
      logger.error("Missing room manager in connection context");
      ws.close(1011, "Internal server error");
      return;
    }
    const { user_id, doc_id } = auth;

    // Generate unique socket_id for this connection
    const socketId = `${user_id}_${Date.now()}`;

    // Join the room (creates room and Y.Doc if needed)
    roomManager.joinRoom(doc_id, user_id, socketId);

    // Track socket for broadcasting
    this.trackSocket(doc_id, user_id, ws);

    // Get or create awareness for this document
    const doc = roomManager.getDoc(doc_id);
    if (!doc) {
      logger.error("Failed to get Y.Doc after joining room", { doc_id, user_id });
      ws.close(4500, "Internal server error");
      return;
    }

    const awareness = this.getOrCreateAwareness(doc_id, doc);

    // Set initial awareness state for this user
    awareness.setLocalStateField("user", {
      user_id,
      connected_at: Date.now(),
    });

    logger.info("Client joined room", {
      doc_id,
      user_id,
      socket_id: socketId,
      participant_count: roomManager.getParticipantCount(doc_id),
    });

    // Send initial sync step 1 to the client
    this.sendSyncStep1(ws, doc);

    // Send current awareness states to the new client
    this.sendAwarenessStates(ws, awareness);

    // Set up message handler
    ws.on("message", (data: RawData) => {
      try {
        const closeCode = this.handleMessage(ctx, data, awareness);
        if (closeCode !== null) {
          ws.close(closeCode, "Protocol error");
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
      this.handleClose(ctx, awareness);
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
      this.handleClose(ctx, awareness);
    });
  }

  handle_connection(ctx: ConnectionContext): void {
    this.handleConnection(ctx);
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
  private handleMessage(
    ctx: ConnectionContext,
    data: RawData,
    awareness: awarenessProtocol.Awareness,
  ): number | null {
    const { auth } = ctx;
    const roomManager =
      ctx.roomManager ?? (ctx as ConnectionContext & { room_manager?: RoomManager }).room_manager;
    if (!roomManager) {
      return 1002;
    }
    const { user_id, doc_id } = auth;

    // Convert RawData to Uint8Array
    const message = this.toUint8Array(data);
    if (message.length === 0) {
      // Empty message is a protocol violation
      return 1002;
    }

    const decoder = decoding.createDecoder(message);
    const message_type = decoding.readVarUint(decoder);

    const doc = roomManager.getDoc(doc_id);
    if (!doc) {
      logger.warn("Received message for non-existent room", { doc_id, user_id });
      return null;
    }

    switch (message_type) {
      case MESSAGE_SYNC:
        this.handleSyncMessage(ctx, decoder, doc);
        break;

      case MESSAGE_AWARENESS:
        this.handleAwarenessMessage(ctx, decoder, awareness);
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
  private handleSyncMessage(ctx: ConnectionContext, decoder: decoding.Decoder, doc: Y.Doc): void {
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
      this.sendMessage(ws, response);
    }

    // If this was an update (sync message type 2), broadcast to other peers
    // sync_message_type: 0 = step1, 1 = step2, 2 = update
    if (sync_message_type === 2) {
      // Re-encode the update for broadcasting
      const update_encoder = encoding.createEncoder();
      encoding.writeVarUint(update_encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(update_encoder, Y.encodeStateAsUpdate(doc));

      const broadcast_message = encoding.toUint8Array(update_encoder);
      this.broadcastToRoom(doc_id, user_id, broadcast_message);
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
  private handleAwarenessMessage(
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
    this.broadcastToRoom(doc_id, user_id, broadcast_message);
  }

  /**
   * Cleans up when a connection closes.
   * Removes participant from room and socket tracking, updates awareness.
   *
   * @param ctx - Connection context
   * @param awareness - Awareness instance for the document
   */
  private handleClose(ctx: ConnectionContext, awareness: awarenessProtocol.Awareness): void {
    const { auth } = ctx;
    const roomManager =
      ctx.roomManager ?? (ctx as ConnectionContext & { room_manager?: RoomManager }).room_manager;
    if (!roomManager) {
      return;
    }
    const { user_id, doc_id } = auth;

    // Remove awareness state for this user
    awarenessProtocol.removeAwarenessStates(awareness, [awareness.clientID], null);

    // Remove socket from tracking
    this.untrackSocket(doc_id, user_id);

    // Leave the room
    roomManager.leaveRoom(doc_id, user_id);

    // Broadcast awareness removal to remaining peers
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, [awareness.clientID]),
    );

    const broadcast_message = encoding.toUint8Array(encoder);
    this.broadcastToRoom(doc_id, user_id, broadcast_message);

    // Clean up awareness when room has no active participants.
    // The room itself is kept in memory to preserve Y.Doc state across brief reconnect gaps.
    if (roomManager.isRoomEmpty(doc_id)) {
      this.awarenessMap.delete(doc_id);
      logger.debug("Room became empty, awareness cleaned up", { doc_id });
    }
  }

  /**
   * Broadcasts a message to all peers in a room except the sender.
   *
   * @param doc_id - Document/room identifier
   * @param sender_id - User ID of the sender (excluded from broadcast)
   * @param message - Binary message to broadcast
   */
  private broadcastToRoom(docId: string, senderId: string, message: Uint8Array): void {
    const roomMap = this.roomSockets.get(docId);
    if (!roomMap) {
      return;
    }

    for (const [userId, socket] of roomMap) {
      if (userId !== senderId) {
        this.sendMessage(socket, message);
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
  private sendSyncStep1(ws: WebSocket, doc: Y.Doc): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);

    const message = encoding.toUint8Array(encoder);
    this.sendMessage(ws, message);
  }

  /**
   * Sends current awareness states to a newly connected client.
   *
   * @param ws - WebSocket to send to
   * @param awareness - Awareness instance with current states
   */
  private sendAwarenessStates(ws: WebSocket, awareness: awarenessProtocol.Awareness): void {
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
    this.sendMessage(ws, message);
  }

  /**
   * Gets or creates an Awareness instance for a document.
   *
   * @param doc_id - Document identifier
   * @param doc - Y.Doc to attach awareness to
   * @returns Awareness instance
   */
  private getOrCreateAwareness(docId: string, doc: Y.Doc): awarenessProtocol.Awareness {
    let awareness = this.awarenessMap.get(docId);
    if (!awareness) {
      awareness = new awarenessProtocol.Awareness(doc);
      this.awarenessMap.set(docId, awareness);
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
  private trackSocket(docId: string, userId: string, ws: WebSocket): void {
    if (!this.roomSockets.has(docId)) {
      this.roomSockets.set(docId, new Map());
    }
    this.roomSockets.get(docId)!.set(userId, ws);
  }

  /**
   * Removes a socket from tracking.
   *
   * @param doc_id - Document/room identifier
   * @param user_id - User identifier
   */
  private untrackSocket(docId: string, userId: string): void {
    const roomMap = this.roomSockets.get(docId);
    if (roomMap) {
      roomMap.delete(userId);
      if (roomMap.size === 0) {
        this.roomSockets.delete(docId);
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
  private sendMessage(ws: WebSocket, message: Uint8Array): void {
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
  private toUint8Array(data: RawData): Uint8Array {
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
  getActiveRoomCount(): number {
    return this.roomSockets.size;
  }

  get_active_room_count(): number {
    return this.getActiveRoomCount();
  }

  /**
   * Returns the number of sockets in a specific room.
   * Useful for monitoring and debugging.
   *
   * @param doc_id - Document/room identifier
   * @returns Count of active sockets in the room
   */
  getRoomSocketCount(docId: string): number {
    return this.roomSockets.get(docId)?.size ?? 0;
  }

  get_room_socket_count(docId: string): number {
    return this.getRoomSocketCount(docId);
  }
}
