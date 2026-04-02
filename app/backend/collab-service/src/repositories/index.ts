/**
 * Repositories for the Collaboration Service.
 * Handles persistence of Y.js CRDT state: updates log and periodic snapshots.
 * Tables: document_collab_updates, document_collab_snapshots.
 *
 * Rule: all DB access lives here. Services never import Drizzle directly.
 */

export { CollabUpdateRepository } from "./collab_update_repository.js";
export { CollabSnapshotRepository } from "./collab_snapshot_repository.js";
