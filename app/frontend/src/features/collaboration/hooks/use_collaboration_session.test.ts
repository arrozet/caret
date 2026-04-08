import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCollaborationSession } from "./useCollaborationSession";

const connect_mock = vi.fn();
const disconnect_mock = vi.fn();
const destroy_mock = vi.fn();
const on_mock = vi.fn();
const off_mock = vi.fn();
const set_local_state_field_mock = vi.fn();
const awareness_on_mock = vi.fn();
const awareness_off_mock = vi.fn();

const extract_presence_users_mock = vi.fn(() => []);

vi.mock("../utils", () => ({
  LOCAL_COLLAB_WS_BASE_URL: "ws://localhost:3003/document",
  createCollaborationSession: vi.fn(() => ({
    ydoc: { id: "y-doc" },
    provider: {
      connect: connect_mock,
      disconnect: disconnect_mock,
      destroy: destroy_mock,
      on: on_mock,
      off: off_mock,
      awareness: {
        setLocalStateField: set_local_state_field_mock,
        on: awareness_on_mock,
        off: awareness_off_mock,
      },
    },
  })),
  destroyCollaborationSession: vi.fn(),
  deriveUserColor: vi.fn(() => "#123456"),
  extractPresenceUsers: vi.fn(() => extract_presence_users_mock()),
}));

/** Unit tests for collaboration session lifecycle hook. */
describe("useCollaborationSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Verifies disabled mode returns a safe disconnected state. */
  it("stays disconnected when collaboration is disabled", () => {
    // Arrange
    const params = {
      enabled: false,
      document_id: "doc-1",
      token: "jwt",
      user_id: "user-1",
      user_name: "Ada",
    };

    // Act
    const { result } = renderHook(() => useCollaborationSession(params));

    // Assert
    expect(result.current.is_ready).toBe(false);
    expect(result.current.connection_status).toBe("disconnected");
    expect(connect_mock).not.toHaveBeenCalled();
  });

  /** Verifies provider setup and connect when all required inputs are present. */
  it("creates session and connects provider when enabled", () => {
    // Arrange
    const params = {
      enabled: true,
      document_id: "doc-1",
      token: "jwt",
      user_id: "user-1",
      user_name: "Ada",
    };

    // Act
    const { result } = renderHook(() => useCollaborationSession(params));

    // Assert
    expect(connect_mock).toHaveBeenCalledTimes(1);
    expect(set_local_state_field_mock).toHaveBeenCalledWith("user", {
      id: "user-1",
      name: "Ada",
      color: "#123456",
    });
    expect(result.current.connection_status).toBe("connecting");
    expect(result.current.is_ready).toBe(true);
  });
});
