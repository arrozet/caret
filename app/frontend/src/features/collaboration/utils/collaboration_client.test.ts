import { describe, it, expect } from "vitest";
import {
  buildCollaborationServerUrl,
  deriveUserColor,
  extractPresenceUsers,
  LOCAL_COLLAB_WS_BASE_URL,
} from "./collaborationClient";

/** Unit tests for collaboration utility helpers and awareness mapping. */
describe("collaboration_client utilities", () => {
  /** Verifies endpoint URL composition for a document room. */
  it("builds collaboration server URL from base endpoint and document id", () => {
    // Arrange
    const document_id = "doc-123";

    // Act
    const room_url = buildCollaborationServerUrl(document_id, LOCAL_COLLAB_WS_BASE_URL);

    // Assert
    expect(room_url).toBe("ws://localhost:3003/document/doc-123");
  });

  /** Verifies color derivation is deterministic for the same identity. */
  it("derives stable color for the same user id", () => {
    // Arrange
    const user_id = "user-abc";

    // Act
    const first = deriveUserColor(user_id);
    const second = deriveUserColor(user_id);

    // Assert
    expect(first).toBe(second);
    expect(first.startsWith("#")).toBe(true);
  });

  /** Verifies awareness payload is normalized into safe presence users. */
  it("extracts awareness users with fallback values", () => {
    // Arrange
    const provider = {
      awareness: {
        getStates: () =>
          new Map([
            [1, { user: { id: "user-1", name: "Ada", color: "#123456" } }],
            [2, { user: { id: "user-2", name: " ", color: "" } }],
            [3, { user: { id: "user-1", name: "Ada Dup", color: "#654321" } }],
            [4, { cursor: { anchor: 1, head: 1 } }],
          ]),
      },
    };

    // Act
    const users = extractPresenceUsers(provider as never);

    // Assert
    expect(users).toHaveLength(2);
    expect(users[0]).toEqual({ id: "user-1", name: "Ada Dup", color: "#654321" });
    expect(users[1].id).toBe("user-2");
    expect(users[1].name).toBe("User");
    expect(users[1].color.startsWith("#")).toBe(true);
  });
});
