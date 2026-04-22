import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCollaborationSession } from "./useCollaborationSession";

const connect_mock = vi.fn();
const disconnect_mock = vi.fn();
const destroy_mock = vi.fn();
let sync_handler: ((is_synced: boolean) => void) | null = null;
const on_mock = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
  if (event === "sync") {
    sync_handler = handler as (is_synced: boolean) => void;
  }
});
const off_mock = vi.fn();
const set_local_state_field_mock = vi.fn();
const awareness_on_mock = vi.fn();
const awareness_off_mock = vi.fn();

const extract_presence_users_mock = vi.fn(() => []);
const bootstrap_collaboration_document_mock = vi.fn();
const has_bootstrap_content_mock = vi.fn((content: unknown) => Boolean(content));
const is_collaboration_document_empty_mock = vi.fn((ydoc: unknown) => {
  void ydoc;
  return true;
});

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

vi.mock("../../editor/utils", () => ({
  bootstrap_collaboration_document: (ydoc: unknown, content: unknown) =>
    bootstrap_collaboration_document_mock(ydoc, content),
  has_bootstrap_content: (content: unknown) => has_bootstrap_content_mock(content),
  is_collaboration_document_empty: (ydoc: unknown) => is_collaboration_document_empty_mock(ydoc),
}));

/** Unit tests for collaboration session lifecycle hook. */
describe("useCollaborationSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sync_handler = null;
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

  /** Verifies persisted editor JSON bootstraps an empty Y.Doc after the first sync. */
  it("bootstraps collaboration state from persisted content after sync", () => {
    // Arrange
    const initial_content = {
      type: "doc",
      content: [{ type: "paragraph" }],
    };

    renderHook(() =>
      useCollaborationSession({
        enabled: true,
        document_id: "doc-1",
        token: "jwt",
        user_id: "user-1",
        user_name: "Ada",
        initial_content,
      }),
    );

    // Act
    act(() => {
      sync_handler?.(true);
    });

    // Assert
    expect(has_bootstrap_content_mock).toHaveBeenCalledWith(initial_content);
    expect(is_collaboration_document_empty_mock).toHaveBeenCalledWith({ id: "y-doc" });
    expect(bootstrap_collaboration_document_mock).toHaveBeenCalledWith(
      { id: "y-doc" },
      initial_content,
    );
  });

  /** Verifies late document fetches still hydrate the Y.Doc after sync. */
  it("bootstraps when persisted content arrives after the first sync", () => {
    // Arrange
    const { rerender } = renderHook(
      ({ initial_content }) =>
        useCollaborationSession({
          enabled: true,
          document_id: "doc-1",
          token: "jwt",
          user_id: "user-1",
          user_name: "Ada",
          initial_content,
        }),
      {
        initialProps: {
          initial_content: null as null | {
            type: string;
            content: Array<{ type: string }>;
          },
        },
      },
    );

    act(() => {
      sync_handler?.(true);
    });

    const initial_content = {
      type: "doc",
      content: [{ type: "paragraph" }],
    };

    // Act
    rerender({ initial_content });

    // Assert
    expect(bootstrap_collaboration_document_mock).toHaveBeenCalledWith(
      { id: "y-doc" },
      initial_content,
    );
  });

  /** Verifies content updates do not recreate the collaboration session. */
  it("does not recreate the session when initial content changes", () => {
    // Arrange
    const { rerender } = renderHook(
      ({ initial_content }) =>
        useCollaborationSession({
          enabled: true,
          document_id: "doc-1",
          token: "jwt",
          user_id: "user-1",
          user_name: "Ada",
          initial_content,
        }),
      {
        initialProps: {
          initial_content: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }],
          },
        },
      },
    );

    // Act
    rerender({
      initial_content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }],
      },
    });

    // Assert
    expect(connect_mock).toHaveBeenCalledTimes(1);
  });
});
