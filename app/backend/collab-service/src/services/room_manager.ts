/**
 * RoomManager service for the Collaboration Service.
 * Manages in-memory collaboration rooms with Y.js documents.
 * Handles room lifecycle: creation on first join, destruction on last leave.
 */

import * as Y from "yjs";
import type { Room } from "../models/index.js";

/**
 * Manages the lifecycle of collaboration rooms in memory.
 * Each room contains a Y.Doc and tracks participants by user_id.
 * Rooms are created on-demand when the first user joins and
 * destroyed automatically when the last user leaves.
 */
export class RoomManager {
  /** Map of active rooms keyed by document_id. */
  private rooms: Map<string, Room> = new Map();

  /**
   * Joins a user to a room, creating the room if it doesn't exist.
   * If the user is already in the room, updates their socket_id.
   *
   * @param document_id - The unique identifier of the document/room.
   * @param user_id - The unique identifier of the user joining.
   * @param socket_id - The WebSocket connection identifier.
   */
  join_room(document_id: string, user_id: string, socket_id: string): void {
    if (!this.rooms.has(document_id)) {
      this.rooms.set(document_id, {
        document_id,
        doc: new Y.Doc(),
        participants: new Map(),
        created_at: new Date(),
      });
    }

    const room = this.rooms.get(document_id)!;
    room.participants.set(user_id, {
      user_id,
      socket_id,
      joined_at: new Date(),
    });
  }

  /**
   * Removes a user from a room. If the room becomes empty, destroys it.
   *
   * @param document_id - The unique identifier of the document/room.
   * @param user_id - The unique identifier of the user leaving.
   * @returns True if the user was removed, false if room or user didn't exist.
   */
  leave_room(document_id: string, user_id: string): boolean {
    const room = this.rooms.get(document_id);
    if (!room) {
      return false;
    }

    const removed = room.participants.delete(user_id);

    if (room.participants.size === 0) {
      this.rooms.delete(document_id);
    }

    return removed;
  }

  /**
   * Returns the list of user_ids currently in the room.
   *
   * @param document_id - The unique identifier of the document/room.
   * @returns Array of user_ids present in the room, or empty array if room doesn't exist.
   */
  get_participants(document_id: string): string[] {
    const room = this.rooms.get(document_id);
    if (!room) {
      return [];
    }
    return Array.from(room.participants.keys());
  }

  /**
   * Returns the Y.Doc associated with the room.
   *
   * @param document_id - The unique identifier of the document/room.
   * @returns The Y.Doc instance, or undefined if room doesn't exist.
   */
  get_doc(document_id: string): Y.Doc | undefined {
    return this.rooms.get(document_id)?.doc;
  }

  /**
   * Checks if a room exists.
   *
   * @param document_id - The unique identifier of the document/room.
   * @returns True if the room exists, false otherwise.
   */
  room_exists(document_id: string): boolean {
    return this.rooms.has(document_id);
  }

  /**
   * Returns the total number of active rooms.
   *
   * @returns The count of active rooms.
   */
  get_room_count(): number {
    return this.rooms.size;
  }

  /**
   * Returns the number of participants in a room.
   *
   * @param document_id - The unique identifier of the document/room.
   * @returns The participant count, or 0 if room doesn't exist.
   */
  get_participant_count(document_id: string): number {
    return this.rooms.get(document_id)?.participants.size ?? 0;
  }
}
