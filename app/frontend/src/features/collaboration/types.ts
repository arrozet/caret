/**
 * TypeScript type definitions for collaboration awareness feature.
 * Defines the shape of user presence data synced via Y.js awareness protocol.
 */

/**
 * Presence status values for a collaborator.
 * - online: User is actively connected and recently active
 * - away: User is connected but has been inactive
 * - offline: User has disconnected (kept briefly for UI transition)
 */
export type PresenceStatus = "online" | "away" | "offline";

/**
 * Cursor position within the document.
 * Represents a selection range using ProseMirror position format.
 */
export interface CursorPosition {
  /** Start of the selection (anchor position). */
  anchor: number;
  /** End of the selection (head position). */
  head: number;
}

/**
 * User information shared via Y.js awareness.
 * This is the local user state that gets broadcast to other clients.
 */
export interface AwarenessUserState {
  /** Unique user identifier (from auth). */
  user_id: string;
  /** Display name for the user. */
  name: string;
  /** Optional email address. */
  email?: string;
  /** Avatar image URL (optional). */
  avatar_url?: string;
  /** Assigned color for cursor/highlights (hex format). */
  color: string;
  /** Current cursor/selection position in the document. */
  cursor?: CursorPosition;
  /** Timestamp of last activity (ISO string or epoch ms). */
  last_active: number;
}

/**
 * Full awareness state for a single client.
 * Includes the client ID and the user state.
 */
export interface AwarenessClient {
  /** Y.js client ID (unique per connection). */
  client_id: number;
  /** User state data. */
  user: AwarenessUserState;
  /** Computed presence status based on activity. */
  presence_status: PresenceStatus;
}

/**
 * Aggregated awareness state for all connected clients.
 */
export interface AwarenessState {
  /** The local user's client ID. */
  local_client_id: number | null;
  /** Map of all connected clients (including local). */
  clients: Map<number, AwarenessClient>;
  /** Array of remote clients (excluding local). */
  remote_clients: AwarenessClient[];
  /** Total number of connected clients. */
  total_count: number;
  /** Whether the local client is currently connected. */
  is_connected: boolean;
}

/**
 * Configuration options for awareness behavior.
 */
export interface AwarenessConfig {
  /** Milliseconds of inactivity before user is marked as "away". */
  away_timeout_ms: number;
  /** Milliseconds of disconnection before user is removed from state. */
  offline_cleanup_ms: number;
  /** Whether to broadcast cursor position changes. */
  broadcast_cursor: boolean;
}

/**
 * Default awareness configuration.
 */
export const DEFAULT_AWARENESS_CONFIG: AwarenessConfig = {
  away_timeout_ms: 60_000, // 1 minute
  offline_cleanup_ms: 10_000, // 10 seconds
  broadcast_cursor: true,
};

/**
 * Predefined colors for collaborator cursors.
 * Ensures good contrast and distinction between users.
 * Colors are chosen to be accessible and visually distinct.
 */
export const COLLABORATOR_COLORS = [
  "#F87171", // red-400
  "#FB923C", // orange-400
  "#FBBF24", // amber-400
  "#34D399", // emerald-400
  "#22D3EE", // cyan-400
  "#60A5FA", // blue-400
  "#A78BFA", // violet-400
  "#F472B6", // pink-400
  "#4ADE80", // green-400
  "#2DD4BF", // teal-400
] as const;

/**
 * Assigns a consistent color to a user based on their ID.
 * Uses a simple hash to ensure the same user always gets the same color.
 *
 * @param user_id - The user's unique identifier.
 * @returns A hex color string from the predefined palette.
 */
export function getUserColor(user_id: string): string {
  let hash = 0;
  for (let i = 0; i < user_id.length; i++) {
    const char = user_id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % COLLABORATOR_COLORS.length;
  return COLLABORATOR_COLORS[index];
}

/**
 * Determines presence status based on last activity timestamp.
 *
 * @param last_active - Timestamp of last user activity (epoch ms).
 * @param config - Awareness configuration for timeout values.
 * @returns The computed presence status.
 */
export function computePresenceStatus(
  last_active: number,
  config: AwarenessConfig = DEFAULT_AWARENESS_CONFIG,
): PresenceStatus {
  const now = Date.now();
  const elapsed = now - last_active;

  if (elapsed < config.away_timeout_ms) {
    return "online";
  }
  return "away";
}
