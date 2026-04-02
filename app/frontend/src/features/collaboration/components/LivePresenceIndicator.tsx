/**
 * LivePresenceIndicator component.
 * Shows connection status and collaborator count as a compact indicator.
 *
 * Provides real-time feedback about collaboration connection state.
 */

import { type HTMLAttributes, forwardRef } from "react";
import { Users, Wifi, WifiOff, Loader2 } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";

/** Connection state for the indicator. */
type ConnectionState = "connected" | "connecting" | "disconnected";

interface LivePresenceIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  /** Current connection state. */
  connection_state: ConnectionState;
  /** Number of connected collaborators (excluding local user). */
  collaborator_count: number;
  /** When true, shows a more compact version. */
  compact?: boolean;
  /** Optional callback when clicked (e.g., to open collaborators panel). */
  on_click?: () => void;
}

/** Icons for each connection state. */
const state_icons: Record<ConnectionState, typeof Wifi> = {
  connected: Wifi,
  connecting: Loader2,
  disconnected: WifiOff,
};

/** Badge variants for connection states. */
const state_variants: Record<ConnectionState, "success" | "warning" | "error"> = {
  connected: "success",
  connecting: "warning",
  disconnected: "error",
};

/** Accessible labels for connection states. */
const state_labels: Record<ConnectionState, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
};

/**
 * LivePresenceIndicator component.
 *
 * A compact indicator showing real-time collaboration status:
 * - Connection state (connected, connecting, disconnected)
 * - Number of other collaborators currently in the document
 *
 * @example
 * ```tsx
 * <LivePresenceIndicator
 *   connection_state="connected"
 *   collaborator_count={3}
 * />
 * ```
 */
export const LivePresenceIndicator = forwardRef<HTMLDivElement, LivePresenceIndicatorProps>(
  function LivePresenceIndicator(
    { connection_state, collaborator_count, compact = false, on_click, className = "", ...rest },
    ref,
  ) {
    const Icon = state_icons[connection_state];
    const variant = state_variants[connection_state];
    const is_connecting = connection_state === "connecting";

    const container_classes = [
      "inline-flex items-center gap-1.5",
      "px-2 py-1",
      "rounded-full",
      "bg-surface",
      "border border-border-subtle",
      "text-text-secondary",
      "text-ui-sm font-ui",
      "transition-colors duration-150",
      on_click ? "cursor-pointer hover:bg-app hover:border-accent-main/30" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    // Compact version: just the badge dot and count
    if (compact) {
      return (
        <div
          ref={ref}
          className={container_classes}
          onClick={on_click}
          role={on_click ? "button" : undefined}
          tabIndex={on_click ? 0 : undefined}
          aria-label={`${state_labels[connection_state]}${collaborator_count > 0 ? `, ${collaborator_count} collaborator${collaborator_count === 1 ? "" : "s"}` : ""}`}
          {...rest}
        >
          <Badge
            variant={variant}
            size="sm"
            pulse={connection_state === "connected" && collaborator_count > 0}
          />
          {collaborator_count > 0 && <span className="font-medium">{collaborator_count}</span>}
        </div>
      );
    }

    // Full version: icon, text, and collaborator count
    return (
      <div
        ref={ref}
        className={container_classes}
        onClick={on_click}
        role={on_click ? "button" : undefined}
        tabIndex={on_click ? 0 : undefined}
        onKeyDown={on_click ? (e) => e.key === "Enter" && on_click() : undefined}
        aria-label={`${state_labels[connection_state]}${collaborator_count > 0 ? `, ${collaborator_count} collaborator${collaborator_count === 1 ? "" : "s"}` : ""}`}
        {...rest}
      >
        {/* Connection state indicator */}
        <Badge variant={variant} size="sm" pulse={is_connecting} />

        {/* Connection icon */}
        <Icon
          className={["h-3.5 w-3.5", is_connecting ? "animate-spin" : ""].join(" ")}
          aria-hidden="true"
        />

        {/* Collaborator count (only when connected and has collaborators) */}
        {connection_state === "connected" && collaborator_count > 0 && (
          <div className="flex items-center gap-1 text-text-primary">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-medium">{collaborator_count}</span>
          </div>
        )}

        {/* Status text (for disconnected or connecting states) */}
        {connection_state !== "connected" && (
          <span className="text-text-ghost">{state_labels[connection_state]}</span>
        )}
      </div>
    );
  },
);
