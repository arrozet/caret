/**
 * React hook for managing Y.js awareness state.
 * Provides reactive access to collaboration presence data.
 *
 * Application layer hook that bridges Y.js awareness protocol
 * with React's component lifecycle.
 */

import { useCallback, useMemo, useSyncExternalStore, useEffect, useRef } from "react";
import type { Awareness } from "y-protocols/awareness";
import type {
  AwarenessState,
  AwarenessClient,
  AwarenessUserState,
  AwarenessConfig,
} from "../types";
import { DEFAULT_AWARENESS_CONFIG, computePresenceStatus } from "../types";

/**
 * Props for the useAwareness hook.
 */
interface UseAwarenessProps {
  /** Y.js Awareness instance (from WebSocket provider). */
  awareness: Awareness | null;
  /** Local user data to broadcast. */
  local_user?: Partial<AwarenessUserState>;
  /** Configuration options. */
  config?: Partial<AwarenessConfig>;
}

/**
 * Return value from the use_awareness hook.
 */
interface UseAwarenessReturn {
  /** Current aggregated awareness state. */
  state: AwarenessState;
  /** Update local user's awareness state. */
  update_local_state: (updates: Partial<AwarenessUserState>) => void;
  /** Update local user's cursor position. */
  update_cursor: (anchor: number, head: number) => void;
  /** Clear local user's cursor (e.g., when editor loses focus). */
  clear_cursor: () => void;
}

/**
 * Creates an empty awareness state.
 */
function createEmptyState(): AwarenessState {
  return {
    local_client_id: null,
    clients: new Map(),
    remote_clients: [],
    total_count: 0,
    is_connected: false,
  };
}

// Singleton empty state to ensure referential equality
const EMPTY_STATE: AwarenessState = createEmptyState();

/**
 * Parses raw Y.js awareness states into typed AwarenessClient objects.
 *
 * @param awareness - The Y.js Awareness instance.
 * @param config - Awareness configuration.
 * @returns Map of client IDs to AwarenessClient objects.
 */
function parseAwarenessStates(
  awareness: Awareness,
  config: AwarenessConfig,
): Map<number, AwarenessClient> {
  const clients = new Map<number, AwarenessClient>();
  const states = awareness.getStates();

  states.forEach((state, client_id) => {
    // Skip clients without user data
    if (!state || !state.user) {
      return;
    }

    const user = state.user as AwarenessUserState;
    const presence_status = computePresenceStatus(user.last_active || Date.now(), config);

    clients.set(client_id, {
      client_id,
      user,
      presence_status,
    });
  });

  return clients;
}

/**
 * Builds the full awareness state from Y.js.
 */
function buildStateFromAwareness(
  awareness: Awareness | null,
  config: AwarenessConfig,
): AwarenessState {
  if (!awareness) {
    return EMPTY_STATE;
  }

  const local_client_id = awareness.clientID;
  const clients = parseAwarenessStates(awareness, config);
  const remote_clients = Array.from(clients.values()).filter(
    (client) => client.client_id !== local_client_id,
  );

  return {
    local_client_id,
    clients,
    remote_clients,
    total_count: clients.size,
    is_connected: clients.has(local_client_id),
  };
}

/**
 * React hook for managing Y.js awareness state.
 *
 * Provides reactive access to collaboration presence data including:
 * - List of connected collaborators with their presence status
 * - Methods to update local user state and cursor position
 * - Automatic presence status computation based on activity
 *
 * @example
 * ```tsx
 * const { state, update_cursor } = useAwareness({
 *   awareness: provider.awareness,
 *   local_user: { user_id: "123", name: "Alice", color: "#F87171" },
 * });
 *
 * // Access remote collaborators
 * state.remote_clients.forEach(client => {
 *   console.log(client.user.name, client.presence_status);
 * });
 * ```
 */
export function useAwareness({
  awareness,
  local_user,
  config: config_overrides,
}: UseAwarenessProps): UseAwarenessReturn {
  // Merge config with defaults - use JSON stringify to stabilize the dependency
  const config_key = JSON.stringify(config_overrides);
  const config = useMemo<AwarenessConfig>(
    () => ({
      ...DEFAULT_AWARENESS_CONFIG,
      ...config_overrides,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config_key],
  );

  // Store config in ref for stable access in subscription callback
  const config_ref = useRef(config);
  config_ref.current = config;

  // Cache the snapshot to ensure referential stability
  const snapshot_cache = useRef<AwarenessState>(EMPTY_STATE);

  // Subscribe function for useSyncExternalStore - only depends on awareness
  const subscribe = useCallback(
    (on_store_change: () => void): (() => void) => {
      if (!awareness) {
        return () => {};
      }

      // Handler that updates the cached snapshot and notifies React
      const handle_change = () => {
        snapshot_cache.current = buildStateFromAwareness(awareness, config_ref.current);
        on_store_change();
      };

      // Initialize snapshot on subscribe
      snapshot_cache.current = buildStateFromAwareness(awareness, config_ref.current);

      // Subscribe to awareness changes
      awareness.on("change", handle_change);

      // Also set up periodic refresh for presence status updates (away detection)
      const interval = setInterval(handle_change, 30_000);

      return () => {
        awareness.off("change", handle_change);
        clearInterval(interval);
      };
    },
    [awareness],
  );

  // Snapshot function for useSyncExternalStore - returns cached value
  const get_snapshot = useCallback((): AwarenessState => {
    if (!awareness) {
      return EMPTY_STATE;
    }
    return snapshot_cache.current;
  }, [awareness]);

  // Server snapshot (same as client for SSR compatibility)
  const get_server_snapshot = useCallback((): AwarenessState => EMPTY_STATE, []);

  // Use React's built-in external store subscription
  const state = useSyncExternalStore(subscribe, get_snapshot, get_server_snapshot);

  /**
   * Updates the local user's awareness state.
   */
  const update_local_state = useCallback(
    (updates: Partial<AwarenessUserState>) => {
      if (!awareness) {
        return;
      }

      const current_state = awareness.getLocalState() || {};
      const current_user = (current_state.user as AwarenessUserState) || {};

      awareness.setLocalStateField("user", {
        ...current_user,
        ...updates,
        last_active: Date.now(),
      });
    },
    [awareness],
  );

  /**
   * Updates the local user's cursor position.
   */
  const update_cursor = useCallback(
    (anchor: number, head: number) => {
      if (!awareness || !config.broadcast_cursor) {
        return;
      }

      const current_state = awareness.getLocalState() || {};
      const current_user = (current_state.user as AwarenessUserState) || {};

      awareness.setLocalStateField("user", {
        ...current_user,
        cursor: { anchor, head },
        last_active: Date.now(),
      });
    },
    [awareness, config.broadcast_cursor],
  );

  /**
   * Clears the local user's cursor (sets to null).
   */
  const clear_cursor = useCallback(() => {
    if (!awareness) {
      return;
    }

    const current_state = awareness.getLocalState() || {};
    const current_user = (current_state.user as AwarenessUserState) || {};

    awareness.setLocalStateField("user", {
      ...current_user,
      cursor: undefined,
      last_active: Date.now(),
    });
  }, [awareness]);

  // Initialize local user state when awareness becomes available
  useEffect(() => {
    if (!awareness || !local_user) {
      return;
    }

    // Set initial local state
    awareness.setLocalStateField("user", {
      ...local_user,
      last_active: Date.now(),
    });
  }, [awareness, local_user]);

  return {
    state,
    update_local_state,
    update_cursor,
    clear_cursor,
  };
}
