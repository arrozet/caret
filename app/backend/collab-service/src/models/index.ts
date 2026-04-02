/**
 * Domain models for the Collaboration Service.
 * Represents Y.js state snapshots, update deltas, and connected session data.
 *
 * Rule: models are used inside Services and Repositories only.
 */

import * as Y from "yjs";

/**
 * Represents a WebSocket participant session in a collaboration room.
 * Tracks a user's connection to a specific document for real-time collaboration.
 */
export interface Participant {
  /** Unique identifier of the user in the system. */
  user_id: string;

  /** Unique identifier of the WebSocket connection. */
  socket_id: string;

  /** Timestamp when the participant joined the room. */
  joined_at: Date;
}

/**
 * Represents an active collaboration room with a shared Y.Doc.
 * Manages the in-memory state for real-time collaborative editing.
 */
export interface Room {
  /** Unique identifier of the document being edited. */
  document_id: string;

  /** The Y.js document instance for CRDT-based synchronization. */
  doc: Y.Doc;

  /** Map of participants keyed by user_id. */
  participants: Map<string, Participant>;

  /** Timestamp when the room was created. */
  created_at: Date;
}

/**
 * Represents a persisted Y.js incremental update.
 * Stored in the database to enable document reconstruction and sync.
 */
export interface CollabUpdate {
  /** Unique identifier of the update record. */
  id: string;

  /** Identifier of the document this update belongs to. */
  document_id: string;

  /** Binary data containing the Y.js incremental update. */
  update_data: Uint8Array;

  /** Timestamp when the update was persisted. */
  created_at: Date;
}

/**
 * Represents a persisted Y.js full-state snapshot.
 * Used as a checkpoint to reduce the number of updates needed for reconstruction.
 */
export interface CollabSnapshot {
  /** Unique identifier of the snapshot record. */
  id: string;

  /** Identifier of the document this snapshot belongs to. */
  document_id: string;

  /** Binary data containing the full Y.js document state. */
  snapshot_data: Uint8Array;

  /** Binary data containing the Y.js state vector at snapshot time. */
  state_vector: Uint8Array;

  /** Timestamp when the snapshot was created. */
  created_at: Date;
}
