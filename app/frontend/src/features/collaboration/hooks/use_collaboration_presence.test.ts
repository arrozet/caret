import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { use_collaboration_presence } from "./use_collaboration_presence";

/** Unit tests for collaboration presence derived state hook. */
describe("use_collaboration_presence", () => {
  /** Verifies solo-state flags when only local user is present. */
  it("returns solo mode when only one user is present", () => {
    // Arrange
    const users = [{ id: "u1", name: "Ada", color: "#111111" }];

    // Act
    const { result } = renderHook(() => use_collaboration_presence(users));

    // Assert
    expect(result.current.users_count).toBe(1);
    expect(result.current.is_solo).toBe(true);
    expect(result.current.has_collaborators).toBe(false);
  });

  /** Verifies collaborator-state flags when multiple users are present. */
  it("returns collaborator mode when multiple users are present", () => {
    // Arrange
    const users = [
      { id: "u1", name: "Ada", color: "#111111" },
      { id: "u2", name: "Lin", color: "#222222" },
    ];

    // Act
    const { result } = renderHook(() => use_collaboration_presence(users));

    // Assert
    expect(result.current.users_count).toBe(2);
    expect(result.current.is_solo).toBe(false);
    expect(result.current.has_collaborators).toBe(true);
  });
});
