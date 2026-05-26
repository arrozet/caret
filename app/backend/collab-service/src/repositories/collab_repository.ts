/**
 * Repository interface and in-memory stub for Y.js state persistence.
 * Real implementation will use Drizzle ORM with PostgreSQL.
 */

import { randomUUID } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema.js";
import { CollabUpdateRepository } from "./collab_update_repository.js";
import { CollabSnapshotRepository } from "./collab_snapshot_repository.js";
import type { CollabUpdate, CollabSnapshot } from "../models/index.js";

/**
 * Interface for Y.js state persistence operations.
 * Defines the contract that any persistence implementation must fulfill.
 * Real implementation uses Drizzle ORM with PostgreSQL.
 */
export interface ICollabRepository {
  /**
   * Saves an incremental Y.js update to storage.
   * @param document_id - The document this update belongs to.
   * @param update - The binary Y.js update data.
   * @returns The persisted update record.
   */
  save_update(document_id: string, update: Uint8Array): Promise<CollabUpdate>;

  /**
   * Retrieves all updates for a document.
   * Updates should be returned in chronological order (oldest first).
   * @param document_id - The document to fetch updates for.
   * @returns Array of update records.
   */
  get_updates(document_id: string): Promise<CollabUpdate[]>;

  /**
   * Saves a full-state snapshot of the Y.js document.
   * Snapshots serve as checkpoints to reduce reconstruction time.
   * @param document_id - The document this snapshot belongs to.
   * @param snapshot - The binary snapshot data (full state).
   * @param state_vector - The state vector at snapshot time.
   * @returns The persisted snapshot record.
   */
  save_snapshot(
    document_id: string,
    snapshot: Uint8Array,
    state_vector: Uint8Array,
  ): Promise<CollabSnapshot>;

  /**
   * Retrieves the most recent snapshot for a document.
   * @param document_id - The document to fetch the snapshot for.
   * @returns The latest snapshot or null if none exists.
   */
  get_latest_snapshot(document_id: string): Promise<CollabSnapshot | null>;

  /**
   * Deletes all updates created before a given snapshot.
   * Used to compact storage after taking a snapshot.
   * @param document_id - The document to clean up.
   * @param snapshot_id - The snapshot ID; updates older than this snapshot are deleted.
   * @returns The number of deleted update records.
   */
  delete_updates_before(document_id: string, snapshot_id: string): Promise<number>;
}

/**
 * In-memory stub implementation of ICollabRepository for testing/MVP.
 * Stores updates and snapshots in memory maps.
 * Not suitable for production use — data is lost on restart.
 */
export class InMemoryCollabRepository implements ICollabRepository {
  /** Map of document_id -> array of updates (in insertion order). */
  private readonly updates_store = new Map<string, CollabUpdate[]>();

  /** Map of document_id -> array of snapshots (in insertion order). */
  private readonly snapshots_store = new Map<string, CollabSnapshot[]>();

  /**
   * Saves an incremental Y.js update to memory.
   * @param document_id - The document this update belongs to.
   * @param update - The binary Y.js update data.
   * @returns The persisted update record.
   */
  async save_update(document_id: string, update: Uint8Array): Promise<CollabUpdate> {
    const record = {
      id: randomUUID(),
      document_id,
      seq: 1,
      update: Buffer.from(update),
      client_id: null,
      user_id: null,
      created_at: new Date(),
      update_data: update,
    } as CollabUpdate & { id: string; update_data: Uint8Array };

    const existing = this.updates_store.get(document_id) ?? [];
    existing.push(record);
    this.updates_store.set(document_id, existing);

    return record;
  }

  /**
   * Retrieves all updates for a document in insertion order.
   * @param document_id - The document to fetch updates for.
   * @returns Array of update records.
   */
  async get_updates(document_id: string): Promise<CollabUpdate[]> {
    return this.updates_store.get(document_id) ?? [];
  }

  /**
   * Saves a full-state snapshot to memory.
   * @param document_id - The document this snapshot belongs to.
   * @param snapshot - The binary snapshot data (full state).
   * @param state_vector - The state vector at snapshot time.
   * @returns The persisted snapshot record.
   */
  async save_snapshot(
    document_id: string,
    snapshot: Uint8Array,
    state_vector: Uint8Array,
  ): Promise<CollabSnapshot> {
    const record = {
      id: randomUUID(),
      document_id,
      snapshot_seq: 1,
      ydoc: Buffer.from(snapshot),
      state_vector: Buffer.from(state_vector),
      created_by_user_id: null,
      created_at: new Date(),
      snapshot_data: snapshot,
    } as CollabSnapshot & { snapshot_data: Uint8Array };

    const existing = this.snapshots_store.get(document_id) ?? [];
    existing.push(record);
    this.snapshots_store.set(document_id, existing);

    return record;
  }

  /**
   * Retrieves the most recent snapshot for a document.
   * @param document_id - The document to fetch the snapshot for.
   * @returns The latest snapshot or null if none exists.
   */
  async get_latest_snapshot(document_id: string): Promise<CollabSnapshot | null> {
    const snapshots = this.snapshots_store.get(document_id) ?? [];
    if (snapshots.length === 0) {
      return null;
    }
    // Return the most recent snapshot (last in array)
    return snapshots[snapshots.length - 1];
  }

  /**
   * Deletes all updates created before a given snapshot.
   * @param document_id - The document to clean up.
   * @param snapshot_id - The snapshot ID; updates older than this snapshot are deleted.
   * @returns The number of deleted update records.
   */
  async delete_updates_before(document_id: string, snapshot_id: string): Promise<number> {
    // Find the snapshot to determine cutoff time
    const snapshots = this.snapshots_store.get(document_id) ?? [];
    const target_snapshot = snapshots.find((s) => s.id === snapshot_id);

    if (!target_snapshot) {
      return 0;
    }

    const updates = this.updates_store.get(document_id) ?? [];
    const cutoff_time = target_snapshot.created_at.getTime();

    // Keep only updates created at or after the snapshot
    const kept_updates = updates.filter((u) => u.created_at.getTime() >= cutoff_time);
    const deleted_count = updates.length - kept_updates.length;

    this.updates_store.set(document_id, kept_updates);

    return deleted_count;
  }

  /**
   * Clears all stored data. Useful for test isolation.
   */
  clear(): void {
    this.updates_store.clear();
    this.snapshots_store.clear();
  }
}

/**
 * Drizzle ORM-based repository implementing ICollabRepository.
 * Delegates to CollabUpdateRepository and CollabSnapshotRepository.
 * Used in production when DATABASE_URL is configured.
 */
export class CollabRepository implements ICollabRepository {
  private update_repo: CollabUpdateRepository;
  private snapshot_repo: CollabSnapshotRepository;

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.update_repo = new CollabUpdateRepository(db);
    this.snapshot_repo = new CollabSnapshotRepository(db);
  }

  async save_update(document_id: string, update: Uint8Array): Promise<CollabUpdate> {
    const max_seq = await this.update_repo.get_max_seq(document_id);
    return this.update_repo.create({
      document_id,
      seq: max_seq + 1,
      update: Buffer.from(update),
    });
  }

  async get_updates(document_id: string): Promise<CollabUpdate[]> {
    return this.update_repo.get_all_updates(document_id);
  }

  async save_snapshot(
    document_id: string,
    snapshot: Uint8Array,
    state_vector: Uint8Array,
  ): Promise<CollabSnapshot> {
    const max_seq = await this.update_repo.get_max_seq(document_id);
    return this.snapshot_repo.create({
      document_id,
      snapshot_seq: max_seq,
      ydoc: Buffer.from(snapshot),
      state_vector: Buffer.from(state_vector),
    });
  }

  async get_latest_snapshot(document_id: string): Promise<CollabSnapshot | null> {
    return this.snapshot_repo.get_latest_snapshot(document_id);
  }

  async delete_updates_before(document_id: string, snapshot_id: string): Promise<number> {
    const snapshot = await this.snapshot_repo.find_by_id(snapshot_id);
    if (!snapshot) {
      return 0;
    }
    return this.update_repo.delete_updates_up_to_seq(document_id, snapshot.snapshot_seq);
  }
}
