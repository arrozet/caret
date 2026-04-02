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
  async persist_update(document_id: string, update: Uint8Array): Promise<CollabUpdate> {
    return this.repository.save_update(document_id, update);
  }

  /**
   * Loads a Y.js document from storage.
   * Reconstructs the document state by applying the latest snapshot
   * followed by any subsequent incremental updates.
   * @param document_id - The document to load.
   * @returns A Y.Doc instance with the reconstructed state.
   */
  async load_document(document_id: string): Promise<Y.Doc> {
    const doc = new Y.Doc();

    // 1. Apply snapshot base if one exists
    const snapshot = await this.repository.get_latest_snapshot(document_id);
    if (snapshot) {
      Y.applyUpdate(doc, snapshot.snapshot_data);
    }

    // 2. Apply all incremental updates on top
    const updates = await this.repository.get_updates(document_id);
    for (const u of updates) {
      Y.applyUpdate(doc, u.update_data);
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
  async take_snapshot(document_id: string, doc: Y.Doc): Promise<CollabSnapshot> {
    const snapshot_data = Y.encodeStateAsUpdate(doc);
    const state_vector = Y.encodeStateVector(doc);
    return this.repository.save_snapshot(document_id, snapshot_data, state_vector);
  }
}
