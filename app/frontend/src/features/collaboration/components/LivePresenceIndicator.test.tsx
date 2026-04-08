/**
 * Unit tests for LivePresenceIndicator component.
 */

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LivePresenceIndicator } from "./LivePresenceIndicator";

describe("LivePresenceIndicator", () => {
  describe("connected state", () => {
    it("renders connected state with collaborators", () => {
      render(<LivePresenceIndicator connection_state="connected" collaborator_count={3} />);

      expect(screen.getByLabelText(/Connected.*3 collaborators/)).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("renders connected state without showing count when 0 collaborators", () => {
      render(<LivePresenceIndicator connection_state="connected" collaborator_count={0} />);

      expect(screen.getByLabelText("Connected")).toBeInTheDocument();
      expect(screen.queryByText("0")).not.toBeInTheDocument();
    });

    it("uses singular form for 1 collaborator", () => {
      render(<LivePresenceIndicator connection_state="connected" collaborator_count={1} />);

      // Aria-label is "Connected, 1 collaborator" (singular)
      expect(screen.getByLabelText("Connected, 1 collaborator")).toBeInTheDocument();
    });
  });

  describe("connecting state", () => {
    it("renders connecting state with text", () => {
      render(<LivePresenceIndicator connection_state="connecting" collaborator_count={0} />);

      expect(screen.getByText("Connecting...")).toBeInTheDocument();
    });

    it("includes connecting in aria-label", () => {
      render(<LivePresenceIndicator connection_state="connecting" collaborator_count={0} />);

      expect(screen.getByLabelText("Connecting...")).toBeInTheDocument();
    });
  });

  describe("disconnected state", () => {
    it("renders disconnected state with text", () => {
      render(<LivePresenceIndicator connection_state="disconnected" collaborator_count={0} />);

      expect(screen.getByText("Disconnected")).toBeInTheDocument();
    });
  });

  describe("compact mode", () => {
    it("renders compact version without text labels", () => {
      render(<LivePresenceIndicator connection_state="connected" collaborator_count={3} compact />);

      // Should show count but not "Connected" text
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    });

    it("renders compact with no count when 0 collaborators", () => {
      const { container } = render(
        <LivePresenceIndicator connection_state="connected" collaborator_count={0} compact />,
      );

      expect(screen.queryByText("0")).not.toBeInTheDocument();
      // Should just have the badge
      expect(container.querySelector("[aria-label]")).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("calls on_click when clicked", async () => {
      const handle_click = vi.fn();

      render(
        <LivePresenceIndicator
          connection_state="connected"
          collaborator_count={2}
          on_click={handle_click}
        />,
      );

      fireEvent.click(screen.getByRole("button"));

      expect(handle_click).toHaveBeenCalledTimes(1);
    });

    it("is not a button when on_click is not provided", () => {
      render(<LivePresenceIndicator connection_state="connected" collaborator_count={2} />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("handles keyboard activation with Enter", async () => {
      const handle_click = vi.fn();

      render(
        <LivePresenceIndicator
          connection_state="connected"
          collaborator_count={2}
          on_click={handle_click}
        />,
      );

      const button = screen.getByRole("button");
      button.focus();
      fireEvent.keyDown(button, { key: "Enter", code: "Enter" });

      expect(handle_click).toHaveBeenCalledTimes(1);
    });
  });

  describe("accessibility", () => {
    it("has accessible aria-label in all states", () => {
      const { rerender } = render(
        <LivePresenceIndicator connection_state="connected" collaborator_count={0} />,
      );
      expect(screen.getByLabelText("Connected")).toBeInTheDocument();

      rerender(<LivePresenceIndicator connection_state="connecting" collaborator_count={0} />);
      expect(screen.getByLabelText("Connecting...")).toBeInTheDocument();

      rerender(<LivePresenceIndicator connection_state="disconnected" collaborator_count={0} />);
      expect(screen.getByLabelText("Disconnected")).toBeInTheDocument();
    });
  });
});
