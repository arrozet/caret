/**
 * Domain models for the Collaboration Service.
 * Represents Y.js state snapshots, update deltas, and connected session data.
 *
 * Rule: models are used inside Services and Repositories only.
 * Rule: never serialize models directly as HTTP responses — map them to DTOs first.
 */

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { document_collab_updates, document_collab_snapshots } from "../db/schema.js";

/* ============================================================
   Y.js Update Log Models
   ============================================================ */

/**
 * A Y.js CRDT update record as stored in the database.
 * Represents a single incremental change to a collaborative document.
 */
export type CollabUpdate = InferSelectModel<typeof document_collab_updates>;

/**
 * Data required to insert a new Y.js update.
 * Omits auto-generated fields (created_at defaults to now).
 */
export type CollabUpdateInsert = InferInsertModel<typeof document_collab_updates>;

/**
 * Composite key for identifying a specific update.
 * Used for lookup and range queries.
 */
export interface CollabUpdateKey {
  /** Document UUID. */
  document_id: string;
  /** Monotonic sequence number within the document. */
  seq: number;
}

/* ============================================================
   Y.js Snapshot Models
   ============================================================ */

/**
 * A Y.js document snapshot as stored in the database.
 * Represents a full-state checkpoint for fast document loading.
 */
export type CollabSnapshot = InferSelectModel<typeof document_collab_snapshots>;

/**
 * Data required to insert a new snapshot.
 * Omits auto-generated fields (id, created_at default automatically).
 */
export type CollabSnapshotInsert = InferInsertModel<typeof document_collab_snapshots>;

/* ============================================================
   Query Parameter Types
   ============================================================ */

/**
 * Parameters for fetching updates after a specific sequence number.
 * Used during Y.js sync protocol to get missing updates.
 */
export interface GetUpdatesAfterSeqParams {
  /** Document UUID. */
  document_id: string;
  /** Fetch updates with seq > after_seq. */
  after_seq: number;
  /** Maximum number of updates to return (optional). */
  limit?: number;
}

/**
 * Result of a batch update insert operation.
 */
export interface BatchInsertResult {
  /** Number of rows successfully inserted. */
  inserted_count: number;
  /** The highest sequence number inserted. */
  last_seq: number;
}

/* ============================================================
   Connected Session Models (in-memory, not persisted)
   ============================================================ */

/**
 * Represents a connected client session for a document.
 * Held in memory by the collaboration service, not persisted.
 */
export interface ConnectedSession {
  /** Unique session identifier (WebSocket connection ID). */
  session_id: string;
  /** Document being collaborated on. */
  document_id: string;
  /** Authenticated user ID (from JWT). */
  user_id: string;
  /** Y.js client ID for this session. */
  yjs_client_id: number;
  /** When the session was established. */
  connected_at: Date;
  /** User's display name for awareness (optional). */
  display_name?: string;
  /** User's cursor color for awareness (optional). */
  cursor_color?: string;
}

/**
 * Y.js awareness state for a connected user.
 * Broadcast to other clients for presence indicators.
 */
export interface AwarenessState {
  /** Y.js client ID. */
  client_id: number;
  /** User ID. */
  user_id: string;
  /** Display name shown to other users. */
  name?: string;
  /** Cursor/selection color. */
  color?: string;
  /** Current cursor position (document-specific). */
  cursor?: {
    /** Index in the Y.js text/array. */
    index: number;
    /** Length of selection (0 = caret). */
    length: number;
  };
}
