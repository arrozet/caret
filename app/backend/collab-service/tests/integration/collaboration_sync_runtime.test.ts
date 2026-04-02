import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import * as Y from "yjs";
import * as sync_protocol from "y-protocols/sync";
import * as awareness_protocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { create_collaboration_server, MESSAGE_SYNC, MESSAGE_AWARENESS } from "../../src/app.js";

/**
 * Integration tests for the local collaboration runtime.
 * Validates that Y.js sync protocol messages are relayed between clients in the same room.
 */
describe("local collaboration runtime", () => {
  const resources_to_cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of resources_to_cleanup.splice(0)) {
      await cleanup();
    }
  });

  /**
   * Verifies that an edit sent by client A reaches client B through the server.
   */
  it("should_relay_yjs_update_between_clients_in_same_document_room", async () => {
    // Arrange
    const server = create_collaboration_server({ port: 0 });
    resources_to_cleanup.push(async () => {
      await close_ws_server(server);
    });

    await wait_for_server_listening(server, 1500);
    const address = server.address() as AddressInfo;
    const websocket_url = `ws://127.0.0.1:${address.port}/document/doc-sync-1?token=test-token`;

    const client_a_ws = new WebSocket(websocket_url);
    const client_b_ws = new WebSocket(websocket_url);

    resources_to_cleanup.push(async () => {
      await close_ws_client(client_a_ws);
      await close_ws_client(client_b_ws);
    });

    const client_a_doc = new Y.Doc();
    const client_b_doc = new Y.Doc();
    const client_a_awareness = new awareness_protocol.Awareness(client_a_doc);
    const client_b_awareness = new awareness_protocol.Awareness(client_b_doc);

    client_a_ws.on("message", (data) => {
      handle_protocol_message(client_a_ws, to_uint8_array(data), client_a_doc, client_a_awareness);
    });
    client_b_ws.on("message", (data) => {
      handle_protocol_message(client_b_ws, to_uint8_array(data), client_b_doc, client_b_awareness);
    });

    await Promise.all([wait_for_ws_open(client_a_ws, 1500), wait_for_ws_open(client_b_ws, 1500)]);

    client_a_ws.send(encode_sync_step_1_message(client_a_doc));
    client_b_ws.send(encode_sync_step_1_message(client_b_doc));

    await wait_for_condition(
      () =>
        client_a_doc.getText("content").toString() === "" &&
        client_b_doc.getText("content").toString() === "",
      1500,
      "initial sync handshake to complete",
    );

    // Act
    client_a_doc.getText("content").insert(0, "hello from client a");
    client_a_ws.send(encode_sync_update_message(Y.encodeStateAsUpdate(client_a_doc)));

    // Assert
    await wait_for_condition(
      () => client_b_doc.getText("content").toString() === "hello from client a",
      2000,
      "client B to receive sync update from client A",
    );
    expect(client_b_doc.getText("content").toString()).toBe("hello from client a");
  });

  /**
   * Verifies that connections without token are rejected as unauthorized.
   */
  it("should_close_connection_with_4001_when_token_is_missing", async () => {
    // Arrange
    const server = create_collaboration_server({ port: 0 });
    resources_to_cleanup.push(async () => {
      await close_ws_server(server);
    });

    await wait_for_server_listening(server, 1500);
    const address = server.address() as AddressInfo;
    const websocket_url = `ws://127.0.0.1:${address.port}/document/doc-sync-unauthorized`;
    const client_ws = new WebSocket(websocket_url);
    resources_to_cleanup.push(async () => {
      await close_ws_client(client_ws);
    });

    // Act
    const close_event = await wait_for_ws_close(client_ws, 1500);

    // Assert
    expect(close_event.code).toBe(4001);
  });

  /**
   * Verifies that malformed document paths are rejected.
   */
  it("should_close_connection_with_1008_for_invalid_document_path", async () => {
    // Arrange
    const server = create_collaboration_server({ port: 0 });
    resources_to_cleanup.push(async () => {
      await close_ws_server(server);
    });

    await wait_for_server_listening(server, 1500);
    const address = server.address() as AddressInfo;
    const websocket_url = `ws://127.0.0.1:${address.port}/documents/doc-sync-1?token=test-token`;
    const client_ws = new WebSocket(websocket_url);
    resources_to_cleanup.push(async () => {
      await close_ws_client(client_ws);
    });

    // Act
    const close_event = await wait_for_ws_close(client_ws, 1500);

    // Assert
    expect(close_event.code).toBe(1008);
  });

  /**
   * Verifies that malformed percent-encoded doc ids are rejected safely.
   */
  it("should_close_connection_with_1008_for_malformed_percent_encoded_doc_id", async () => {
    // Arrange
    const server = create_collaboration_server({ port: 0 });
    resources_to_cleanup.push(async () => {
      await close_ws_server(server);
    });

    await wait_for_server_listening(server, 1500);
    const address = server.address() as AddressInfo;
    const websocket_url = `ws://127.0.0.1:${address.port}/document/%E0%A4%A?token=test-token`;
    const client_ws = new WebSocket(websocket_url);
    resources_to_cleanup.push(async () => {
      await close_ws_client(client_ws);
    });

    // Act
    const close_event = await wait_for_ws_close(client_ws, 1500);

    // Assert
    expect(close_event.code).toBe(1008);
  });

  /**
   * Verifies that malformed protocol frames are handled safely and the socket is closed.
   */
  it("should_close_socket_with_1002_when_frame_payload_is_malformed", async () => {
    // Arrange
    const server = create_collaboration_server({ port: 0 });
    resources_to_cleanup.push(async () => {
      await close_ws_server(server);
    });

    await wait_for_server_listening(server, 1500);
    const address = server.address() as AddressInfo;
    const websocket_url = `ws://127.0.0.1:${address.port}/document/doc-malformed-frame?token=test-token`;
    const client_ws = new WebSocket(websocket_url);
    resources_to_cleanup.push(async () => {
      await close_ws_client(client_ws);
    });

    await wait_for_ws_open(client_ws, 1500);

    // Act
    client_ws.send(new Uint8Array(0));
    const close_event = await wait_for_ws_close(client_ws, 1500);

    // Assert
    expect(close_event.code).toBe(1002);
  });

  /**
   * Verifies helper behavior when server is already listening before listener registration.
   */
  it("should_resolve_wait_for_server_listening_when_server_is_already_listening", async () => {
    // Arrange
    const server = create_collaboration_server({ port: 0 });
    resources_to_cleanup.push(async () => {
      await close_ws_server(server);
    });

    await wait_for_server_listening(server, 1500);
    await sleep(20);

    // Act
    await wait_for_server_listening(server, 100);

    // Assert
    expect(server.address()).not.toBeNull();
  });
});

/**
 * Converts incoming ws payloads to Uint8Array format.
 */
function to_uint8_array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  return new Uint8Array(data as ArrayBufferLike);
}

/**
 * Handles one incoming Y.js protocol message and returns protocol replies when needed.
 */
function handle_protocol_message(
  ws: WebSocket,
  payload: Uint8Array,
  doc: Y.Doc,
  awareness: awareness_protocol.Awareness,
): void {
  const decoder = decoding.createDecoder(payload);
  const message_type = decoding.readVarUint(decoder);

  if (message_type === MESSAGE_SYNC) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    sync_protocol.readSyncMessage(decoder, encoder, doc, "remote");
    if (encoding.length(encoder) > 1 && ws.readyState === WebSocket.OPEN) {
      ws.send(encoding.toUint8Array(encoder));
    }
    return;
  }

  if (message_type === MESSAGE_AWARENESS) {
    const awareness_update = decoding.readVarUint8Array(decoder);
    awareness_protocol.applyAwarenessUpdate(awareness, awareness_update, "remote");
  }
}

/**
 * Encodes a sync-step-1 message for a Y.Doc.
 */
function encode_sync_step_1_message(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  sync_protocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

/**
 * Encodes a sync-update message for an already computed Y.Doc update.
 */
function encode_sync_update_message(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  sync_protocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

/**
 * Waits for a ws client to open.
 */
function wait_for_ws_open(ws: WebSocket, timeout_ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for websocket open"));
    }, timeout_ms);

    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });

    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * Waits for a ws client close event.
 */
function wait_for_ws_close(
  ws: WebSocket,
  timeout_ms: number,
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for websocket close"));
    }, timeout_ms);

    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });

    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * Waits for the server to start listening.
 */
function wait_for_server_listening(
  server: {
    once: (event: "listening", listener: () => void) => void;
    off?: (event: "listening", listener: () => void) => void;
    address?: () => unknown;
  },
  timeout_ms: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof server.address === "function" && server.address()) {
      resolve();
      return;
    }

    const on_listening = (): void => {
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      if (server.off) {
        server.off("listening", on_listening);
      }
      reject(new Error("Timed out waiting for server listening"));
    }, timeout_ms);

    server.once("listening", on_listening);

    if (typeof server.address === "function" && server.address()) {
      clearTimeout(timer);
      if (server.off) {
        server.off("listening", on_listening);
      }
      resolve();
    }
  });
}

/**
 * Waits until a condition becomes true or times out.
 */
async function wait_for_condition(
  condition: () => boolean,
  timeout_ms: number,
  reason: string,
): Promise<void> {
  const start_time = Date.now();
  while (!condition()) {
    if (Date.now() - start_time > timeout_ms) {
      throw new Error(`Timed out waiting for ${reason}`);
    }
    await sleep(20);
  }
}

/**
 * Sleeps for a fixed duration.
 */
function sleep(duration_ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, duration_ms);
  });
}

/**
 * Closes a WebSocket client and waits for completion.
 */
function close_ws_client(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      ws.terminate();
      resolve();
    }, 400);

    ws.once("close", () => {
      clearTimeout(timer);
      resolve();
    });

    ws.close();
  });
}

/**
 * Closes a WebSocket server and waits for completion.
 */
function close_ws_server(server: { close: (cb: () => void) => void }): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve();
    }, 600);

    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
