/**
 * Drizzle ORM schema for the Collaboration Service.
 * Tables: document_collab_updates, document_collab_snapshots.
 * See DATABASE.md for the full schema specification.
 */

import {
  pgTable,
  uuid,
  bigint,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";

/* ============================================================
   Custom column types
   ============================================================ */

/**
 * Binary data type for PostgreSQL bytea.
 * Used for Y.js update and snapshot binary data.
 */
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/* ============================================================
   1) Y.js Update Log
   ============================================================ */

/**
 * Append-only log of Y.js updates for each document.
 *
 * This table stores incremental CRDT updates as binary data. Updates are
 * persisted in batches (not on every keystroke) to reduce write load.
 *
 * Composite PK on (document_id, seq) enables efficient range queries:
 * "get all updates after seq N for document X".
 *
 * Note: Application code should enforce `seq > 0` constraint
 * (CHECK constraints not supported by Drizzle ORM natively).
 */
export const document_collab_updates = pgTable(
  "document_collab_updates",
  {
    /**
     * FK to documents(id).
     * Part of composite primary key.
     * CASCADE DELETE: when document is deleted, all updates are deleted.
     */
    document_id: uuid("document_id").notNull(),

    /**
     * Monotonic sequence number per document.
     * Part of composite primary key.
     * Enables ordered retrieval of updates for CRDT synchronization.
     * Application constraint: seq > 0
     */
    seq: bigint("seq", { mode: "number" }).notNull(),

    /**
     * Y.js update binary data (bytea).
     * Contains the CRDT operation encoded by Y.js.
     */
    update: bytea("update").notNull(),

    /**
     * Optional Y.js client ID that generated this update.
     * Used for debugging and client tracking.
     */
    client_id: bigint("client_id", { mode: "number" }),

    /**
     * User who made this change (FK to auth.users).
     * Nullable for system-generated updates.
     * SET NULL on user delete to preserve update history.
     */
    user_id: uuid("user_id"),

    /**
     * When this update was persisted to the database.
     */
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * Composite primary key on (document_id, seq).
     * Ensures no duplicate sequence numbers per document.
     * Optimized for range queries: WHERE document_id = X AND seq > N
     */
    primaryKey({ columns: [table.document_id, table.seq] }),

    /**
     * List updates by document and recency.
     * Used for debugging, operations, and audit.
     */
    index("idx_document_collab_updates_doc_created").on(table.document_id, table.created_at),
  ],
);

/* ============================================================
   2) Y.js Snapshots
   ============================================================ */

/**
 * Periodic full-state checkpoints used to speed up document load
 * and compact the update log.
 *
 * Snapshots are created periodically (e.g. every N updates or M minutes)
 * to allow clients to load the full document state without replaying
 * all updates from the beginning.
 *
 * After creating a snapshot, older updates can be pruned to bound
 * storage growth.
 */
export const document_collab_snapshots = pgTable(
  "document_collab_snapshots",
  {
    /**
     * Primary key.
     */
    id: uuid("id").primaryKey().defaultRandom().notNull(),

    /**
     * FK to documents(id).
     * CASCADE DELETE: when document is deleted, all snapshots are deleted.
     */
    document_id: uuid("document_id").notNull(),

    /**
     * Highest sequence number included in this snapshot.
     * Identifies which updates have been incorporated.
     * Application constraint: snapshot_seq > 0
     */
    snapshot_seq: bigint("snapshot_seq", { mode: "number" }).notNull(),

    /**
     * Full Y.js document state (binary).
     * Contains the complete CRDT state encoded by Y.js.
     */
    ydoc: bytea("ydoc").notNull(),

    /**
     * Y.js state vector (binary).
     * Used for efficient sync protocol - identifies which updates
     * a client already has.
     */
    state_vector: bytea("state_vector").notNull(),

    /**
     * User who triggered this snapshot (FK to auth.users).
     * Nullable for automatic system-generated snapshots.
     * SET NULL on user delete to preserve snapshot history.
     */
    created_by_user_id: uuid("created_by_user_id"),

    /**
     * When this snapshot was created.
     */
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * UNIQUE constraint: one snapshot per (document_id, snapshot_seq).
     * Prevents duplicate snapshots at the same sequence number.
     */
    uniqueIndex("uq_document_collab_snapshots_doc_seq").on(table.document_id, table.snapshot_seq),

    /**
     * Load latest snapshot for a document efficiently.
     * Query pattern: ORDER BY snapshot_seq DESC LIMIT 1
     * Critical for fast document load performance.
     */
    index("idx_document_collab_snapshots_doc_seq_desc").on(table.document_id, table.snapshot_seq),
  ],
);
