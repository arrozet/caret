/**
 * Repositories for the Collaboration Service.
 * Handles persistence of Y.js CRDT state: updates log and periodic snapshots.
 * Tables: document_collab_updates, document_collab_snapshots.
 *
 * Rule: all DB access lives here. Services never import Drizzle directly.
 */

// Drizzle-based repositories for persistent storage
export { CollabUpdateRepository } from "./collab_update_repository.js";
export { CollabSnapshotRepository } from "./collab_snapshot_repository.js";

// In-memory repository for testing and local development
export type { ICollabRepository } from "./collab_repository.js";
export { InMemoryCollabRepository } from "./collab_repository.js";
