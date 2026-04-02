/**
 * Services for the Collaboration Service.
 * Manage the Y.js document lifecycle: loading state from DB, applying updates, broadcasting to peers.
 * Receive Repositories via constructor injection (DI).
 *
 * Rule: no WebSocket concepts (ws, message event) inside Services.
 * Rule: no direct ORM/SQL — delegate to Repositories.
 */

export { RoomManager } from "./room_manager.js";
export { CollabPersistenceService } from "./collab_persistence_service.js";
