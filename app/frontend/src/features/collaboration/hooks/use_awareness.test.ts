/**
 * Unit tests for useAwareness hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Awareness } from "y-protocols/awareness";
import { useAwareness } from "./useAwareness";
import type { AwarenessUserState } from "../types";

/**
 * Mock Awareness type matching Y.js Awareness interface.
 */
type MockAwareness = Pick<
  Awareness,
  "clientID" | "getStates" | "getLocalState" | "setLocalStateField" | "on" | "off"
> & {
  _emit: (event: string, ...args: unknown[]) => void;
  _add_client: (client_id: number, user: AwarenessUserState) => void;
  _remove_client: (client_id: number) => void;
};

/**
 * Creates a mock Y.js Awareness instance for testing.
 */
function create_mock_awareness(): MockAwareness {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const states = new Map<number, { user: AwarenessUserState }>();
  let local_state: { user?: Partial<AwarenessUserState> } = {};

  return {
    clientID: 1,

    getStates: vi.fn(() => states),
    getLocalState: vi.fn(() => local_state),
    setLocalStateField: vi.fn((field: string, value: unknown) => {
      local_state = { ...local_state, [field]: value };
      // Trigger change event
      const change_listeners = listeners.get("change");
      if (change_listeners) {
        change_listeners.forEach((cb) => cb());
      }
    }),
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(callback);
    }),
    off: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(callback);
    }),

    // Test helpers
    _emit: (event: string, ...args: unknown[]) => {
      listeners.get(event)?.forEach((cb) => cb(...args));
    },
    _add_client: (client_id: number, user: AwarenessUserState) => {
      states.set(client_id, { user });
    },
    _remove_client: (client_id: number) => {
      states.delete(client_id);
    },
  };
}

describe("useAwareness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initialization", () => {
    it("returns empty state when awareness is null", () => {
      const { result } = renderHook(() => useAwareness({ awareness: null }));

      expect(result.current.state.local_client_id).toBeNull();
      expect(result.current.state.clients.size).toBe(0);
      expect(result.current.state.remote_clients).toHaveLength(0);
      expect(result.current.state.is_connected).toBe(false);
    });

    it("sets initial local user state when provided", () => {
      const mock = create_mock_awareness();
      const local_user = {
        user_id: "user-1",
        name: "Test User",
        color: "#F87171",
      };

      renderHook(() =>
        useAwareness({
          awareness: mock as unknown as Awareness,
          local_user,
        }),
      );

      expect(mock.setLocalStateField).toHaveBeenCalledWith("user", {
        ...local_user,
        last_active: expect.any(Number),
      });
    });
  });

  describe("state parsing", () => {
    it("parses awareness states into typed clients", () => {
      const mock = create_mock_awareness();
      mock._add_client(1, {
        user_id: "user-1",
        name: "Local User",
        color: "#F87171",
        last_active: Date.now(),
      });
      mock._add_client(2, {
        user_id: "user-2",
        name: "Remote User",
        color: "#60A5FA",
        last_active: Date.now(),
      });

      const { result } = renderHook(() =>
        useAwareness({ awareness: mock as unknown as Awareness }),
      );

      expect(result.current.state.clients.size).toBe(2);
      expect(result.current.state.local_client_id).toBe(1);
    });

    it("filters out local client from remote_clients", () => {
      const mock = create_mock_awareness();
      mock._add_client(1, {
        user_id: "user-1",
        name: "Local User",
        color: "#F87171",
        last_active: Date.now(),
      });
      mock._add_client(2, {
        user_id: "user-2",
        name: "Remote User",
        color: "#60A5FA",
        last_active: Date.now(),
      });

      const { result } = renderHook(() =>
        useAwareness({ awareness: mock as unknown as Awareness }),
      );

      expect(result.current.state.remote_clients).toHaveLength(1);
      expect(result.current.state.remote_clients[0].client_id).toBe(2);
    });

    it("computes presence status based on last_active", () => {
      const mock = create_mock_awareness();
      const now = Date.now();

      // Online user (recent activity)
      mock._add_client(1, {
        user_id: "user-1",
        name: "Online User",
        color: "#F87171",
        last_active: now,
      });

      // Away user (old activity - 2 minutes ago)
      mock._add_client(2, {
        user_id: "user-2",
        name: "Away User",
        color: "#60A5FA",
        last_active: now - 120000,
      });

      const { result } = renderHook(() =>
        useAwareness({ awareness: mock as unknown as Awareness }),
      );

      const client1 = result.current.state.clients.get(1);
      const client2 = result.current.state.clients.get(2);

      expect(client1?.presence_status).toBe("online");
      expect(client2?.presence_status).toBe("away");
    });
  });

  describe("update methods", () => {
    it("update_local_state updates awareness state", () => {
      const mock = create_mock_awareness();
      mock._add_client(1, {
        user_id: "user-1",
        name: "Test",
        color: "#F87171",
        last_active: Date.now(),
      });

      const { result } = renderHook(() =>
        useAwareness({ awareness: mock as unknown as Awareness }),
      );

      act(() => {
        result.current.update_local_state({ name: "Updated Name" });
      });

      expect(mock.setLocalStateField).toHaveBeenCalledWith("user", {
        name: "Updated Name",
        last_active: expect.any(Number),
      });
    });

    it("update_cursor updates cursor position", () => {
      const mock = create_mock_awareness();
      mock._add_client(1, {
        user_id: "user-1",
        name: "Test",
        color: "#F87171",
        last_active: Date.now(),
      });

      const { result } = renderHook(() =>
        useAwareness({ awareness: mock as unknown as Awareness }),
      );

      act(() => {
        result.current.update_cursor(10, 20);
      });

      expect(mock.setLocalStateField).toHaveBeenCalledWith("user", {
        cursor: { anchor: 10, head: 20 },
        last_active: expect.any(Number),
      });
    });

    it("clear_cursor removes cursor from state", () => {
      const mock = create_mock_awareness();
      mock._add_client(1, {
        user_id: "user-1",
        name: "Test",
        color: "#F87171",
        cursor: { anchor: 10, head: 20 },
        last_active: Date.now(),
      });

      const { result } = renderHook(() =>
        useAwareness({ awareness: mock as unknown as Awareness }),
      );

      act(() => {
        result.current.clear_cursor();
      });

      expect(mock.setLocalStateField).toHaveBeenCalledWith("user", {
        cursor: undefined,
        last_active: expect.any(Number),
      });
    });

    it("does not broadcast cursor when disabled in config", () => {
      const mock = create_mock_awareness();
      mock._add_client(1, {
        user_id: "user-1",
        name: "Test",
        color: "#F87171",
        last_active: Date.now(),
      });

      const { result } = renderHook(() =>
        useAwareness({
          awareness: mock as unknown as Awareness,
          config: { broadcast_cursor: false },
        }),
      );

      act(() => {
        result.current.update_cursor(10, 20);
      });

      // Should not have been called for cursor update
      expect(mock.setLocalStateField).not.toHaveBeenCalledWith(
        "user",
        expect.objectContaining({ cursor: expect.anything() }),
      );
    });
  });

  describe("event subscriptions", () => {
    it("subscribes to awareness change events", () => {
      const mock = create_mock_awareness();

      renderHook(() => useAwareness({ awareness: mock as unknown as Awareness }));

      expect(mock.on).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("unsubscribes on unmount", () => {
      const mock = create_mock_awareness();

      const { unmount } = renderHook(() =>
        useAwareness({ awareness: mock as unknown as Awareness }),
      );

      unmount();

      expect(mock.off).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("updates state when awareness changes", () => {
      const mock = create_mock_awareness();
      mock._add_client(1, {
        user_id: "user-1",
        name: "Test",
        color: "#F87171",
        last_active: Date.now(),
      });

      const { result } = renderHook(() =>
        useAwareness({ awareness: mock as unknown as Awareness }),
      );

      expect(result.current.state.remote_clients).toHaveLength(0);

      // Add a new remote client
      act(() => {
        mock._add_client(2, {
          user_id: "user-2",
          name: "New User",
          color: "#60A5FA",
          last_active: Date.now(),
        });
        mock._emit("change");
      });

      expect(result.current.state.remote_clients).toHaveLength(1);
    });
  });
});
