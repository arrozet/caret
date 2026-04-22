/**
 * Room manager service for the Collaboration Service.
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
  joinRoom(documentId: string, userId: string, socketId: string): void {
    if (!this.rooms.has(documentId)) {
      this.rooms.set(documentId, {
        document_id: documentId,
        doc: new Y.Doc(),
        participants: new Map(),
        created_at: new Date(),
      });
    }

    const room = this.rooms.get(documentId)!;
    room.participants.set(userId, {
      user_id: userId,
      socket_id: socketId,
      joined_at: new Date(),
    });
  }

  join_room(documentId: string, userId: string, socketId: string): void {
    this.joinRoom(documentId, userId, socketId);
  }

  /**
   * Removes a user from a room.
   *
   * Note: We intentionally keep empty rooms in memory so the Y.Doc state
   * survives brief disconnect gaps (e.g. both collaborators close/reopen tabs)
   * without resetting to an empty document.
   *
   * @param document_id - The unique identifier of the document/room.
   * @param user_id - The unique identifier of the user leaving.
   * @param socket_id - Optional WebSocket identifier for stale-connection protection.
   * @returns True if the user was removed, false if room or user didn't exist.
   */
  leaveRoom(documentId: string, userId: string, socketId?: string): boolean {
    const room = this.rooms.get(documentId);
    if (!room) {
      return false;
    }

    if (socketId !== undefined) {
      const participant = room.participants.get(userId);
      if (!participant || participant.socket_id !== socketId) {
        return false;
      }
    }

    const removed = room.participants.delete(userId);

    return removed;
  }

  leave_room(documentId: string, userId: string, socketId?: string): boolean {
    return this.leaveRoom(documentId, userId, socketId);
  }

  /**
   * Returns the list of user_ids currently in the room.
   *
   * @param document_id - The unique identifier of the document/room.
   * @returns Array of user_ids present in the room, or empty array if room doesn't exist.
   */
  getParticipants(documentId: string): string[] {
    const room = this.rooms.get(documentId);
    if (!room) {
      return [];
    }
    return Array.from(room.participants.keys());
  }

  get_participants(documentId: string): string[] {
    return this.getParticipants(documentId);
  }

  /**
   * Returns the Y.Doc associated with the room.
   *
   * @param document_id - The unique identifier of the document/room.
   * @returns The Y.Doc instance, or undefined if room doesn't exist.
   */
  getDoc(documentId: string): Y.Doc | undefined {
    return this.rooms.get(documentId)?.doc;
  }

  get_doc(documentId: string): Y.Doc | undefined {
    return this.getDoc(documentId);
  }

  /**
   * Checks if a room exists.
   *
   * @param document_id - The unique identifier of the document/room.
   * @returns True if the room exists, false otherwise.
   */
  roomExists(documentId: string): boolean {
    return this.rooms.has(documentId);
  }

  room_exists(documentId: string): boolean {
    return this.roomExists(documentId);
  }

  /**
   * Returns the total number of active rooms.
   *
   * @returns The count of active rooms.
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  get_room_count(): number {
    return this.getRoomCount();
  }

  /**
   * Returns the number of participants in a room.
   *
   * @param document_id - The unique identifier of the document/room.
   * @returns The participant count, or 0 if room doesn't exist.
   */
  getParticipantCount(documentId: string): number {
    return this.rooms.get(documentId)?.participants.size ?? 0;
  }

  get_participant_count(documentId: string): number {
    return this.getParticipantCount(documentId);
  }

  /**
   * Checks whether a room exists and currently has zero participants.
   *
   * @param document_id - The unique identifier of the document/room.
   * @returns True when room exists and has no active participants.
   */
  isRoomEmpty(documentId: string): boolean {
    const room = this.rooms.get(documentId);
    return room !== undefined && room.participants.size === 0;
  }

  is_room_empty(documentId: string): boolean {
    return this.isRoomEmpty(documentId);
  }
}

export type { RoomManager as RoomManagerService };
