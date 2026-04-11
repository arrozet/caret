/**
 * Service for persisting and loading Y.js document state.
 * Handles the serialization/deserialization of Y.js documents
 * and coordinates with the repository for storage operations.
 */

import * as Y from "yjs";
import type { ICollabRepository } from "../repositories/collab_repository.js";
import type { CollabUpdate, CollabSnapshot } from "../models/index.js";

/**
 * Service for persisting and loading Y.js document state.
 * Coordinates between in-memory Y.js documents and persistent storage.
 */
export class CollabPersistenceService {
  /**
   * Creates a new CollabPersistenceService instance.
   * @param repository - The repository implementation for storage operations.
   */
  constructor(private readonly repository: ICollabRepository) {}

  /**
   * Persists a Y.js incremental update to storage.
   * Called whenever a document change occurs to ensure durability.
   * @param document_id - The document this update belongs to.
   * @param update - The binary Y.js update data.
   * @returns The persisted update record.
   */
  async persistUpdate(documentId: string, update: Uint8Array): Promise<CollabUpdate> {
    return this.repository.save_update(documentId, update);
  }

  /**
   * Loads a Y.js document from storage.
   * Reconstructs the document state by applying the latest snapshot
   * followed by any subsequent incremental updates.
   * @param document_id - The document to load.
   * @returns A Y.Doc instance with the reconstructed state.
   */
  async loadDocument(documentId: string): Promise<Y.Doc> {
    const doc = new Y.Doc();

    // 1. Apply snapshot base if one exists
    const snapshot = await this.repository.get_latest_snapshot(documentId);
    if (snapshot) {
      Y.applyUpdate(
        doc,
        snapshot.ydoc ??
          (snapshot as CollabSnapshot & { snapshot_data?: Uint8Array }).snapshot_data!,
      );
    }

    // 2. Apply all incremental updates on top
    const updates = await this.repository.get_updates(documentId);
    for (const update of updates) {
      const update_data = update.update ?? (update as { update_data?: Uint8Array }).update_data;
      Y.applyUpdate(doc, update_data as Uint8Array);
    }

    return doc;
  }

  /**
   * Takes a snapshot of the current document state.
   * Snapshots serve as checkpoints to reduce the number of updates
   * needed for document reconstruction.
   * @param document_id - The document to snapshot.
   * @param doc - The Y.Doc instance to capture.
   * @returns The persisted snapshot record.
   */
  async takeSnapshot(documentId: string, doc: Y.Doc): Promise<CollabSnapshot> {
    const snapshot_data = Y.encodeStateAsUpdate(doc);
    const state_vector = Y.encodeStateVector(doc);
    return this.repository.save_snapshot(documentId, snapshot_data, state_vector);
  }
}
