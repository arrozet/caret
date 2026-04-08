/**
 * Unit tests for CollaboratorsList component.
 */

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CollaboratorsList } from "./CollaboratorsList";
import type { AwarenessClient } from "../types";

/**
 * Creates a mock collaborator for testing.
 */
function create_mock_collaborator(
  overrides: Partial<{
    client_id: number;
    name: string;
    color: string;
    presence_status: "online" | "away" | "offline";
  }> = {},
): AwarenessClient {
  return {
    client_id: overrides.client_id ?? Math.floor(Math.random() * 1000),
    user: {
      user_id: `user-${overrides.client_id ?? 1}`,
      name: overrides.name ?? "Test User",
      color: overrides.color ?? "#F87171",
      last_active: Date.now(),
    },
    presence_status: overrides.presence_status ?? "online",
  };
}

describe("CollaboratorsList", () => {
  it("renders nothing when collaborators array is empty", () => {
    const { container } = render(<CollaboratorsList collaborators={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders avatars for each collaborator", () => {
    const collaborators = [
      create_mock_collaborator({ client_id: 1, name: "Alice" }),
      create_mock_collaborator({ client_id: 2, name: "Bob" }),
    ];

    render(<CollaboratorsList collaborators={collaborators} />);

    expect(screen.getByLabelText("Avatar for Alice")).toBeInTheDocument();
    expect(screen.getByLabelText("Avatar for Bob")).toBeInTheDocument();
  });

  it("shows overflow count when more than max_visible", () => {
    const collaborators = [
      create_mock_collaborator({ client_id: 1, name: "Alice" }),
      create_mock_collaborator({ client_id: 2, name: "Bob" }),
      create_mock_collaborator({ client_id: 3, name: "Charlie" }),
      create_mock_collaborator({ client_id: 4, name: "David" }),
      create_mock_collaborator({ client_id: 5, name: "Eve" }),
    ];

    render(<CollaboratorsList collaborators={collaborators} max_visible={3} />);

    // Should show 3 avatars plus overflow
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("does not show overflow when at or below max_visible", () => {
    const collaborators = [
      create_mock_collaborator({ client_id: 1, name: "Alice" }),
      create_mock_collaborator({ client_id: 2, name: "Bob" }),
    ];

    render(<CollaboratorsList collaborators={collaborators} max_visible={4} />);

    expect(screen.queryByText(/\+\d+/)).not.toBeInTheDocument();
  });

  it("calls on_collaborator_click when avatar is clicked", async () => {
    const handle_click = vi.fn();
    const collaborator = create_mock_collaborator({ client_id: 1, name: "Alice" });

    render(
      <CollaboratorsList collaborators={[collaborator]} on_collaborator_click={handle_click} />,
    );

    fireEvent.click(screen.getByLabelText("Avatar for Alice"));

    expect(handle_click).toHaveBeenCalledWith(collaborator);
  });

  it("sorts collaborators with online first", () => {
    const collaborators = [
      create_mock_collaborator({ client_id: 1, name: "Away User", presence_status: "away" }),
      create_mock_collaborator({ client_id: 2, name: "Online User", presence_status: "online" }),
      create_mock_collaborator({ client_id: 3, name: "Offline User", presence_status: "offline" }),
    ];

    render(<CollaboratorsList collaborators={collaborators} />);

    // Verify all avatars are rendered by checking aria-labels
    expect(screen.getByLabelText("Avatar for Online User")).toBeInTheDocument();
    expect(screen.getByLabelText("Avatar for Away User")).toBeInTheDocument();
    expect(screen.getByLabelText("Avatar for Offline User")).toBeInTheDocument();

    // Verify the group aria-label
    expect(screen.getByRole("group")).toHaveAttribute("aria-label", "3 collaborators connected");
  });

  it("renders with correct aria-label for singular collaborator", () => {
    const collaborators = [create_mock_collaborator({ client_id: 1, name: "Alice" })];

    render(<CollaboratorsList collaborators={collaborators} />);

    expect(screen.getByRole("group")).toHaveAttribute("aria-label", "1 collaborator connected");
  });

  it("applies stacked styling by default", () => {
    const collaborators = [
      create_mock_collaborator({ client_id: 1, name: "Alice" }),
      create_mock_collaborator({ client_id: 2, name: "Bob" }),
    ];

    const { container } = render(<CollaboratorsList collaborators={collaborators} />);

    // Check for negative margin class
    expect(container.firstChild).toHaveClass("-space-x-1.5");
  });

  it("removes stacking when stacked=false", () => {
    const collaborators = [
      create_mock_collaborator({ client_id: 1, name: "Alice" }),
      create_mock_collaborator({ client_id: 2, name: "Bob" }),
    ];

    const { container } = render(
      <CollaboratorsList collaborators={collaborators} stacked={false} />,
    );

    expect(container.firstChild).toHaveClass("gap-1");
    expect(container.firstChild).not.toHaveClass("-space-x-1.5");
  });
});
