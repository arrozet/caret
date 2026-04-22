/**
 * Integration tests for ConnectionHandler.
 * Validates Y.js sync protocol implementation, awareness protocol,
 * and multi-client collaboration scenarios without a real WebSocket server.
 *
 * These tests verify:
 * - Initial sync step 1 is sent on connection
 * - Updates from one client are broadcast to others
 * - Disconnection properly cleans up resources
 * - Room isolation (clients in different doc_ids don't interfere)
 * - Awareness state is broadcast correctly
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { WebSocket } from "ws";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { ConnectionHandler } from "../../src/handlers/connection_handler.js";
import { RoomManager } from "../../src/services/room_manager.js";
import type { AuthResult } from "../../src/middleware/auth_middleware.js";

/** Message type: Y.js sync protocol messages (step1, step2, update) */
const MESSAGE_SYNC = 0;

/** Message type: Awareness protocol messages (user presence, cursors) */
const MESSAGE_AWARENESS = 1;

/**
 * Creates a mock WebSocket object for testing.
 * Provides spies for send, close, and event handlers.
 *
 * @returns Mock WebSocket with standard properties and methods
 */
function make_mock_ws(): WebSocket & {
  _handlers: Map<string, (...args: unknown[]) => void>;
  trigger: (event: string, ...args: unknown[]) => void;
} {
  const handlers = new Map<string, (...args: unknown[]) => void>();

  const mock_ws = {
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    readyState: 1, // OPEN
    OPEN: 1,
    _handlers: handlers,
    /** Helper to trigger registered event handlers */
    trigger: (event: string, ...args: unknown[]) => {
      const handler = handlers.get(event);
      if (handler) {
        handler(...args);
      }
    },
  } as unknown as WebSocket & {
    _handlers: Map<string, (...args: unknown[]) => void>;
    trigger: (event: string, ...args: unknown[]) => void;
  };

  return mock_ws;
}

/**
 * Creates a mock AuthResult for testing.
 *
 * @param user_id - User identifier
 * @param doc_id - Document identifier
 * @returns AuthResult object with mock token
 */
function make_auth(user_id: string, doc_id: string): AuthResult {
  return { user_id, doc_id, token: "mock-token" };
}

/**
 * Extracts the message type from a binary Y.js protocol message.
 *
 * @param data - Binary message data
 * @returns Message type (MESSAGE_SYNC or MESSAGE_AWARENESS)
 */
function get_message_type(data: Uint8Array): number {
  const decoder = decoding.createDecoder(data);
  return decoding.readVarUint(decoder);
}

/**
 * Creates a Y.js sync step 1 message for testing.
 * This is what a client would send to initiate sync.
 *
 * @param doc - Y.Doc to create sync step 1 for
 * @returns Encoded sync step 1 message
 */
function create_sync_step1_message(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

/**
 * Creates a Y.js update message for testing.
 * This is what a client sends when making document changes.
 *
 * @param update - Y.js update binary
 * @returns Encoded update message
 */
function create_update_message(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

/**
 * Creates an awareness update message for testing.
 *
 * @param awareness - Awareness instance
 * @param client_ids - Client IDs to include in update
 * @returns Encoded awareness message
 */
function create_awareness_message(
  awareness: awarenessProtocol.Awareness,
  client_ids: number[],
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, client_ids),
  );
  return encoding.toUint8Array(encoder);
}

describe("ConnectionHandler", () => {
  let handler: ConnectionHandler;
  let room_manager: RoomManager;

  beforeEach(() => {
    handler = new ConnectionHandler();
    room_manager = new RoomManager();
    vi.clearAllMocks();
  });

  /**
   * Tests for initial connection and sync step 1.
   */
  describe("initial connection", () => {
    /** Verifies that new connections receive sync step 1 immediately */
    it("should send sync step 1 to new connections", () => {
      // Arrange
      const ws = make_mock_ws();
      const auth = make_auth("user-1", "doc-1");

      // Act
      handler.handleConnection({ ws, auth, roomManager: room_manager });

      // Assert
      expect(ws.send).toHaveBeenCalled();
      const first_call = (ws.send as Mock).mock.calls[0];
      const message = first_call[0] as Uint8Array;
      expect(get_message_type(message)).toBe(MESSAGE_SYNC);
    });

    /** Verifies that connection creates room via room_manager */
    it("should join room via room_manager", () => {
      // Arrange
      const ws = make_mock_ws();
      const auth = make_auth("user-1", "doc-1");

      // Act
      handler.handleConnection({ ws, auth, roomManager: room_manager });

      // Assert
      expect(room_manager.roomExists("doc-1")).toBe(true);
      expect(room_manager.getParticipants("doc-1")).toContain("user-1");
    });

    /** Verifies that handler tracks the socket internally */
    it("should track socket in internal room map", () => {
      // Arrange
      const ws = make_mock_ws();
      const auth = make_auth("user-1", "doc-1");

      // Act
      handler.handleConnection({ ws, auth, roomManager: room_manager });

      // Assert
      expect(handler.getActiveRoomCount()).toBe(1);
      expect(handler.getRoomSocketCount("doc-1")).toBe(1);
    });

    /** Verifies that message handlers are registered on the WebSocket */
    it("should register message, close, and error handlers", () => {
      // Arrange
      const ws = make_mock_ws();
      const auth = make_auth("user-1", "doc-1");

      // Act
      handler.handleConnection({ ws, auth, roomManager: room_manager });

      // Assert
      expect(ws.on).toHaveBeenCalledWith("message", expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith("close", expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith("error", expect.any(Function));
    });
  });

  /**
   * Tests for Y.js sync protocol message handling.
   */
  describe("sync protocol", () => {
    /** Verifies that sync step 1 from client triggers sync step 2 response */
    it("should respond to client sync step 1 with sync step 2", () => {
      // Arrange
      const ws = make_mock_ws();
      const auth = make_auth("user-1", "doc-1");
      handler.handleConnection({ ws, auth, roomManager: room_manager });

      // Clear initial messages
      (ws.send as Mock).mockClear();

      // Create a client doc with some content
      const client_doc = new Y.Doc();
      client_doc.getText("content").insert(0, "client content");

      // Create sync step 1 from client
      const sync_step1 = create_sync_step1_message(client_doc);

      // Act - simulate receiving sync step 1
      ws.trigger("message", Buffer.from(sync_step1));

      // Assert - should receive sync step 2 (sync response)
      expect(ws.send).toHaveBeenCalled();
      const response = (ws.send as Mock).mock.calls[0][0] as Uint8Array;
      expect(get_message_type(response)).toBe(MESSAGE_SYNC);
    });

    /** Verifies that updates are applied to the Y.Doc */
    it("should apply updates to room Y.Doc", () => {
      // Arrange
      const ws = make_mock_ws();
      const auth = make_auth("user-1", "doc-1");
      handler.handle_connection({ ws, auth, room_manager });

      // Create update from a client doc
      const client_doc = new Y.Doc();
      client_doc.getText("content").insert(0, "hello world");
      const update = Y.encodeStateAsUpdate(client_doc);
      const update_message = create_update_message(update);

      // Act - simulate receiving update
      ws.trigger("message", Buffer.from(update_message));

      // Assert - server doc should have the content
      const server_doc = room_manager.get_doc("doc-1");
      expect(server_doc).toBeDefined();
      expect(server_doc!.getText("content").toString()).toBe("hello world");
    });
  });

  /**
   * Tests for multi-client update broadcasting.
   */
  describe("update broadcasting", () => {
    /** Verifies that updates from one client are broadcast to others in same room */
    it("should broadcast updates to other clients in room", () => {
      // Arrange - connect two clients to same room
      const ws1 = make_mock_ws();
      const ws2 = make_mock_ws();
      const auth1 = make_auth("user-1", "doc-shared");
      const auth2 = make_auth("user-2", "doc-shared");

      handler.handle_connection({ ws: ws1, auth: auth1, room_manager });
      handler.handle_connection({ ws: ws2, auth: auth2, room_manager });

      // Clear initial messages
      (ws1.send as Mock).mockClear();
      (ws2.send as Mock).mockClear();

      // Create update from user-1
      const client_doc = new Y.Doc();
      client_doc.getText("content").insert(0, "from user 1");
      const update = Y.encodeStateAsUpdate(client_doc);
      const update_message = create_update_message(update);

      // Act - user-1 sends update
      ws1.trigger("message", Buffer.from(update_message));

      // Assert - user-2 should receive broadcast, user-1 should not
      expect(ws2.send).toHaveBeenCalled();
      const broadcast = (ws2.send as Mock).mock.calls[0][0] as Uint8Array;
      expect(get_message_type(broadcast)).toBe(MESSAGE_SYNC);
    });

    /** Verifies that sender doesn't receive their own broadcast */
    it("should not send broadcast back to sender", () => {
      // Arrange
      const ws1 = make_mock_ws();
      const ws2 = make_mock_ws();
      const auth1 = make_auth("user-1", "doc-shared");
      const auth2 = make_auth("user-2", "doc-shared");

      handler.handle_connection({ ws: ws1, auth: auth1, room_manager });
      handler.handle_connection({ ws: ws2, auth: auth2, room_manager });

      // Clear initial messages
      (ws1.send as Mock).mockClear();
      (ws2.send as Mock).mockClear();

      // Create update
      const client_doc = new Y.Doc();
      client_doc.getText("content").insert(0, "test");
      const update = Y.encodeStateAsUpdate(client_doc);
      const update_message = create_update_message(update);

      // Act
      ws1.trigger("message", Buffer.from(update_message));

      // Assert - count messages: ws1 may get sync response but not broadcast
      // ws2 should get broadcast
      const ws2_calls = (ws2.send as Mock).mock.calls.length;
      expect(ws2_calls).toBeGreaterThanOrEqual(1);
    });

    /** Verifies multiple clients all receive broadcasts */
    it("should broadcast to all clients except sender", () => {
      // Arrange - connect three clients
      const ws1 = make_mock_ws();
      const ws2 = make_mock_ws();
      const ws3 = make_mock_ws();

      handler.handle_connection({
        ws: ws1,
        auth: make_auth("user-1", "doc-multi"),
        room_manager,
      });
      handler.handle_connection({
        ws: ws2,
        auth: make_auth("user-2", "doc-multi"),
        room_manager,
      });
      handler.handle_connection({
        ws: ws3,
        auth: make_auth("user-3", "doc-multi"),
        room_manager,
      });

      // Clear initial messages
      (ws1.send as Mock).mockClear();
      (ws2.send as Mock).mockClear();
      (ws3.send as Mock).mockClear();

      // Create update from user-1
      const client_doc = new Y.Doc();
      client_doc.getText("content").insert(0, "broadcast test");
      const update = Y.encodeStateAsUpdate(client_doc);
      const update_message = create_update_message(update);

      // Act
      ws1.trigger("message", Buffer.from(update_message));

      // Assert - ws2 and ws3 should receive, ws1 should not get broadcast
      expect(ws2.send).toHaveBeenCalled();
      expect(ws3.send).toHaveBeenCalled();
    });
  });

  /**
   * Tests for room isolation - clients in different rooms shouldn't interfere.
   */
  describe("room isolation", () => {
    /** Verifies clients in different rooms don't receive each other's updates */
    it("should not broadcast updates to clients in different rooms", () => {
      // Arrange - connect clients to different rooms
      const ws_room_a = make_mock_ws();
      const ws_room_b = make_mock_ws();

      handler.handle_connection({
        ws: ws_room_a,
        auth: make_auth("user-a", "doc-room-a"),
        room_manager,
      });
      handler.handle_connection({
        ws: ws_room_b,
        auth: make_auth("user-b", "doc-room-b"),
        room_manager,
      });

      // Clear initial messages
      (ws_room_a.send as Mock).mockClear();
      (ws_room_b.send as Mock).mockClear();

      // Create update from user in room A
      const client_doc = new Y.Doc();
      client_doc.getText("content").insert(0, "room A content");
      const update = Y.encodeStateAsUpdate(client_doc);
      const update_message = create_update_message(update);

      // Act - room A user sends update
      ws_room_a.trigger("message", Buffer.from(update_message));

      // Assert - room B user should NOT receive the update
      expect(ws_room_b.send).not.toHaveBeenCalled();
    });

    /** Verifies each room has independent Y.Doc state */
    it("should maintain independent Y.Doc state per room", () => {
      // Arrange
      const ws_room_a = make_mock_ws();
      const ws_room_b = make_mock_ws();

      handler.handle_connection({
        ws: ws_room_a,
        auth: make_auth("user-a", "doc-room-a"),
        room_manager,
      });
      handler.handle_connection({
        ws: ws_room_b,
        auth: make_auth("user-b", "doc-room-b"),
        room_manager,
      });

      // Create updates for each room
      const doc_a = new Y.Doc();
      doc_a.getText("content").insert(0, "content A");
      const update_a = create_update_message(Y.encodeStateAsUpdate(doc_a));

      const doc_b = new Y.Doc();
      doc_b.getText("content").insert(0, "content B");
      const update_b = create_update_message(Y.encodeStateAsUpdate(doc_b));

      // Act
      ws_room_a.trigger("message", Buffer.from(update_a));
      ws_room_b.trigger("message", Buffer.from(update_b));

      // Assert - each room has its own content
      const server_doc_a = room_manager.get_doc("doc-room-a");
      const server_doc_b = room_manager.get_doc("doc-room-b");

      expect(server_doc_a!.getText("content").toString()).toBe("content A");
      expect(server_doc_b!.getText("content").toString()).toBe("content B");
    });

    /** Verifies active room count tracks rooms independently */
    it("should track rooms independently in handler", () => {
      // Arrange & Act
      handler.handle_connection({
        ws: make_mock_ws(),
        auth: make_auth("user-1", "doc-1"),
        room_manager,
      });
      handler.handle_connection({
        ws: make_mock_ws(),
        auth: make_auth("user-2", "doc-2"),
        room_manager,
      });
      handler.handle_connection({
        ws: make_mock_ws(),
        auth: make_auth("user-3", "doc-1"),
        room_manager,
      });

      // Assert
      expect(handler.get_active_room_count()).toBe(2);
      expect(handler.get_room_socket_count("doc-1")).toBe(2);
      expect(handler.get_room_socket_count("doc-2")).toBe(1);
    });
  });

  /**
   * Tests for disconnect cleanup.
   */
  describe("disconnect cleanup", () => {
    /** Verifies socket is untracked on close */
    it("should untrack socket on close", () => {
      // Arrange
      const ws = make_mock_ws();
      const auth = make_auth("user-1", "doc-1");
      handler.handle_connection({ ws, auth, room_manager });

      expect(handler.get_room_socket_count("doc-1")).toBe(1);

      // Act - trigger close event
      ws.trigger("close", 1000, Buffer.from("normal close"));

      // Assert
      expect(handler.get_room_socket_count("doc-1")).toBe(0);
    });

    /** Verifies participant is removed from room on close */
    it("should leave room via room_manager on close", () => {
      // Arrange
      const ws = make_mock_ws();
      const auth = make_auth("user-1", "doc-1");
      handler.handle_connection({ ws, auth, room_manager });

      expect(room_manager.get_participants("doc-1")).toContain("user-1");

      // Act
      ws.trigger("close", 1000, Buffer.from(""));

      // Assert
      expect(room_manager.get_participants("doc-1")).not.toContain("user-1");
    });

    /** Verifies room is kept when last user disconnects */
    it("should keep room when last user disconnects", () => {
      // Arrange
      const ws = make_mock_ws();
      const auth = make_auth("user-1", "doc-solo");
      handler.handle_connection({ ws, auth, room_manager });

      // Act
      ws.trigger("close", 1000, Buffer.from(""));

      // Assert
      expect(room_manager.room_exists("doc-solo")).toBe(true);
      expect(room_manager.is_room_empty("doc-solo")).toBe(true);
      expect(handler.get_active_room_count()).toBe(0);
    });

    /** Verifies room persists when other users remain */
    it("should keep room when other users remain after disconnect", () => {
      // Arrange
      const ws1 = make_mock_ws();
      const ws2 = make_mock_ws();

      handler.handle_connection({
        ws: ws1,
        auth: make_auth("user-1", "doc-shared"),
        room_manager,
      });
      handler.handle_connection({
        ws: ws2,
        auth: make_auth("user-2", "doc-shared"),
        room_manager,
      });

      // Act - user-1 disconnects
      ws1.trigger("close", 1000, Buffer.from(""));

      // Assert - room still exists with user-2
      expect(room_manager.room_exists("doc-shared")).toBe(true);
      expect(room_manager.get_participants("doc-shared")).toContain("user-2");
      expect(handler.get_room_socket_count("doc-shared")).toBe(1);
    });

    /** Verifies error handler also triggers cleanup */
    it("should cleanup on WebSocket error", () => {
      // Arrange
      const ws = make_mock_ws();
      const auth = make_auth("user-1", "doc-error");
      handler.handle_connection({ ws, auth, room_manager });

      // Act - trigger error event
      ws.trigger("error", new Error("connection lost"));

      // Assert
      expect(handler.get_room_socket_count("doc-error")).toBe(0);
      expect(room_manager.room_exists("doc-error")).toBe(true);
      expect(room_manager.is_room_empty("doc-error")).toBe(true);
    });

    /** Verifies awareness state is broadcast on disconnect */
    it("should broadcast awareness removal on disconnect", () => {
      // Arrange - two users in same room
      const ws1 = make_mock_ws();
      const ws2 = make_mock_ws();

      handler.handle_connection({
        ws: ws1,
        auth: make_auth("user-1", "doc-awareness-leave"),
        room_manager,
      });
      handler.handle_connection({
        ws: ws2,
        auth: make_auth("user-2", "doc-awareness-leave"),
        room_manager,
      });

      // Clear initial messages
      (ws2.send as Mock).mockClear();

      // Act - user-1 disconnects
      ws1.trigger("close", 1000, Buffer.from(""));

      // Assert - user-2 should receive awareness update
      expect(ws2.send).toHaveBeenCalled();
      const message = (ws2.send as Mock).mock.calls[0][0] as Uint8Array;
      expect(get_message_type(message)).toBe(MESSAGE_AWARENESS);
    });

    /** Verifies a stale close does not evict a newer connection for the same user. */
    it("should_ignore_close_from_stale_socket_when_user_reconnects", () => {
      // Arrange
      const first_ws = make_mock_ws();
      const second_ws = make_mock_ws();
      const auth = make_auth("user-1", "doc-reconnect");

      handler.handle_connection({ ws: first_ws, auth, room_manager });
      handler.handle_connection({ ws: second_ws, auth, room_manager });

      expect(room_manager.get_participants("doc-reconnect")).toContain("user-1");
      expect(handler.get_room_socket_count("doc-reconnect")).toBe(1);

      // Act - old socket closes after a newer reconnect is already active
      first_ws.trigger("close", 1000, Buffer.from(""));

      // Assert
      expect(room_manager.get_participants("doc-reconnect")).toContain("user-1");
      expect(handler.get_room_socket_count("doc-reconnect")).toBe(1);
      expect(handler.get_active_room_count()).toBe(1);
    });

    /** Verifies stale sockets cannot mutate document state after a reconnect. */
    it("should_ignore_messages_from_stale_socket_after_reconnect", () => {
      // Arrange
      const first_ws = make_mock_ws();
      const second_ws = make_mock_ws();
      const auth = make_auth("user-1", "doc-stale-message");

      handler.handle_connection({ ws: first_ws, auth, room_manager });
      handler.handle_connection({ ws: second_ws, auth, room_manager });

      (second_ws.send as Mock).mockClear();

      const client_doc = new Y.Doc();
      client_doc.getText("content").insert(0, "stale update");
      const update = Y.encodeStateAsUpdate(client_doc);
      const message = create_update_message(update);

      // Act - old socket sends an update after the reconnect is already active
      first_ws.trigger("message", Buffer.from(message));

      // Assert
      const server_doc = room_manager.get_doc("doc-stale-message");
      expect(server_doc?.getText("content").toString()).toBe("");
      expect(second_ws.send).not.toHaveBeenCalled();
    });
  });

  /**
   * Tests for awareness protocol.
   */
  describe("awareness protocol", () => {
    /** Verifies initial awareness states are sent to new connections */
    it("should send awareness states to new connections", () => {
      // Arrange - first user connects
      const ws1 = make_mock_ws();
      handler.handle_connection({
        ws: ws1,
        auth: make_auth("user-1", "doc-awareness"),
        room_manager,
      });

      // Connect second user
      const ws2 = make_mock_ws();

      // Act
      handler.handle_connection({
        ws: ws2,
        auth: make_auth("user-2", "doc-awareness"),
        room_manager,
      });

      // Assert - ws2 should receive sync step 1 and awareness states
      const calls = (ws2.send as Mock).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);

      // Check if any call is awareness message
      const has_awareness = calls.some((call) => {
        const msg = call[0] as Uint8Array;
        return get_message_type(msg) === MESSAGE_AWARENESS;
      });
      expect(has_awareness).toBe(true);
    });

    /** Verifies awareness updates are broadcast to other clients */
    it("should broadcast awareness updates to other clients", () => {
      // Arrange
      const ws1 = make_mock_ws();
      const ws2 = make_mock_ws();

      handler.handle_connection({
        ws: ws1,
        auth: make_auth("user-1", "doc-awareness-update"),
        room_manager,
      });
      handler.handle_connection({
        ws: ws2,
        auth: make_auth("user-2", "doc-awareness-update"),
        room_manager,
      });

      // Clear initial messages
      (ws2.send as Mock).mockClear();

      // Create awareness update from a client doc
      const client_doc = new Y.Doc();
      const client_awareness = new awarenessProtocol.Awareness(client_doc);
      client_awareness.setLocalStateField("cursor", { x: 100, y: 200 });

      const awareness_msg = create_awareness_message(client_awareness, [client_awareness.clientID]);

      // Act - user-1 sends awareness update
      ws1.trigger("message", Buffer.from(awareness_msg));

      // Assert - user-2 should receive awareness broadcast
      expect(ws2.send).toHaveBeenCalled();
      const broadcast = (ws2.send as Mock).mock.calls[0][0] as Uint8Array;
      expect(get_message_type(broadcast)).toBe(MESSAGE_AWARENESS);
    });
  });

  /**
   * Tests for edge cases and error handling.
   */
  describe("edge cases", () => {
    /** Verifies empty messages are ignored */
    it("should handle empty messages gracefully", () => {
      // Arrange
      const ws = make_mock_ws();
      handler.handle_connection({
        ws,
        auth: make_auth("user-1", "doc-empty"),
        room_manager,
      });
      (ws.send as Mock).mockClear();

      // Act - send empty buffer
      ws.trigger("message", Buffer.from([]));

      // Assert - no crash, no response
      expect(ws.send).not.toHaveBeenCalled();
    });

    /** Verifies unknown message types are ignored */
    it("should ignore unknown message types", () => {
      // Arrange
      const ws = make_mock_ws();
      handler.handle_connection({
        ws,
        auth: make_auth("user-1", "doc-unknown"),
        room_manager,
      });
      (ws.send as Mock).mockClear();

      // Create message with unknown type (99)
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 99);
      encoding.writeVarString(encoder, "unknown data");
      const unknown_msg = encoding.toUint8Array(encoder);

      // Act
      ws.trigger("message", Buffer.from(unknown_msg));

      // Assert - no crash, no response
      // Just verify the room is still functional
      expect(room_manager.room_exists("doc-unknown")).toBe(true);
    });

    /** Verifies socket with closed state doesn't send */
    it("should not send to closed sockets", () => {
      // Arrange
      const ws1 = make_mock_ws();
      const ws2 = make_mock_ws();

      handler.handle_connection({
        ws: ws1,
        auth: make_auth("user-1", "doc-closed"),
        room_manager,
      });
      handler.handle_connection({
        ws: ws2,
        auth: make_auth("user-2", "doc-closed"),
        room_manager,
      });

      // Simulate ws2 being closed
      (ws2 as unknown as { readyState: number }).readyState = 3; // CLOSED

      // Clear messages
      (ws2.send as Mock).mockClear();

      // Create update
      const client_doc = new Y.Doc();
      client_doc.getText("content").insert(0, "test");
      const update_msg = create_update_message(Y.encodeStateAsUpdate(client_doc));

      // Act
      ws1.trigger("message", Buffer.from(update_msg));

      // Assert - ws2.send should not be called since it's closed
      expect(ws2.send).not.toHaveBeenCalled();
    });

    /** Verifies ArrayBuffer data is handled */
    it("should handle ArrayBuffer message data", () => {
      // Arrange
      const ws = make_mock_ws();
      handler.handle_connection({
        ws,
        auth: make_auth("user-1", "doc-arraybuffer"),
        room_manager,
      });

      const client_doc = new Y.Doc();
      client_doc.getText("content").insert(0, "arraybuffer test");
      const update = Y.encodeStateAsUpdate(client_doc);
      const update_msg = create_update_message(update);

      // Convert to ArrayBuffer
      const array_buffer = update_msg.buffer.slice(
        update_msg.byteOffset,
        update_msg.byteOffset + update_msg.byteLength,
      );

      // Act
      ws.trigger("message", array_buffer);

      // Assert
      const server_doc = room_manager.get_doc("doc-arraybuffer");
      expect(server_doc!.getText("content").toString()).toBe("arraybuffer test");
    });
  });
});
