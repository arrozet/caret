/**
 * Repositories for the Collaboration Service.
 * Handles persistence of Y.js CRDT state: updates log and periodic snapshots.
 * Tables: document_collab_updates, document_collab_snapshots.
 *
 * Rule: all DB access lives here. Services never import Drizzle directly.
 */

export type { ICollabRepository } from "./collab_repository.js";
export { InMemoryCollabRepository } from "./collab_repository.js";
