import type { RoomManager } from "./room_manager.js";
import type { CollabPersistenceService } from "./collab_persistence_service.js";
import { logger } from "../lib/logger.js";

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

export class SnapshotScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private roomManager: RoomManager,
    private persistence: CollabPersistenceService,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.takeSnapshots(), SNAPSHOT_INTERVAL_MS);
    logger.info("Snapshot scheduler started", { interval_ms: SNAPSHOT_INTERVAL_MS });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async takeSnapshots(): Promise<void> {
    const docIds = this.roomManager.getAllDocumentIds();
    for (const docId of docIds) {
      const doc = this.roomManager.getDoc(docId);
      if (!doc) continue;
      try {
        await this.persistence.takeSnapshot(docId, doc);
        logger.debug("Snapshot taken", { doc_id: docId });
      } catch (error) {
        logger.error("Snapshot failed, keeping incremental log", { doc_id: docId, error });
      }
    }
  }
}
