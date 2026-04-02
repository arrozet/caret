/**
 * CollaboratorsList component.
 * Displays a list/stack of avatars for connected collaborators.
 *
 * Presentation layer component that renders real-time user presence
 * using Y.js awareness data from the use_awareness hook.
 */

import { type HTMLAttributes, forwardRef, useMemo } from "react";
import { Avatar } from "../../../components/ui/Avatar";
import type { AwarenessClient, PresenceStatus } from "../types";

/** Size presets for the collaborators list. */
type CollaboratorsListSize = "sm" | "md" | "lg";

interface CollaboratorsListProps extends HTMLAttributes<HTMLDivElement> {
  /** Array of connected collaborators from awareness state. */
  collaborators: AwarenessClient[];
  /** Size preset for avatars. Defaults to "sm". */
  size?: CollaboratorsListSize;
  /** Maximum number of avatars to display before showing overflow count. */
  max_visible?: number;
  /** When true, avatars stack with overlap. Defaults to true. */
  stacked?: boolean;
  /** Callback when a collaborator avatar is clicked. */
  on_collaborator_click?: (collaborator: AwarenessClient) => void;
}

/** Avatar size mapping for list sizes. */
const avatar_size_map: Record<CollaboratorsListSize, "sm" | "md" | "lg"> = {
  sm: "sm",
  md: "md",
  lg: "lg",
};

/** Overlap spacing for stacked avatars. */
const stack_spacing: Record<CollaboratorsListSize, string> = {
  sm: "-space-x-1.5",
  md: "-space-x-2",
  lg: "-space-x-2.5",
};

/** Font size for overflow count badge. */
const overflow_text_size: Record<CollaboratorsListSize, string> = {
  sm: "text-[9px]",
  md: "text-[10px]",
  lg: "text-ui-sm",
};

/** Avatar container size for overflow badge. */
const overflow_container_size: Record<CollaboratorsListSize, string> = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
};

/**
 * Sorts collaborators by presence status (online first) and then by name.
 */
function sort_collaborators(collaborators: AwarenessClient[]): AwarenessClient[] {
  const status_order: Record<PresenceStatus, number> = {
    online: 0,
    away: 1,
    offline: 2,
  };

  return [...collaborators].sort((a, b) => {
    // First sort by presence status
    const status_diff = status_order[a.presence_status] - status_order[b.presence_status];
    if (status_diff !== 0) {
      return status_diff;
    }
    // Then sort alphabetically by name
    return a.user.name.localeCompare(b.user.name);
  });
}

/**
 * CollaboratorsList component.
 *
 * Displays connected collaborators as a row of avatars with presence indicators.
 * Supports stacked (overlapping) layout and overflow count for many collaborators.
 *
 * @example
 * ```tsx
 * const { state } = use_awareness({ awareness });
 *
 * <CollaboratorsList
 *   collaborators={state.remote_clients}
 *   size="sm"
 *   max_visible={4}
 * />
 * ```
 */
export const CollaboratorsList = forwardRef<HTMLDivElement, CollaboratorsListProps>(
  function CollaboratorsList(
    {
      collaborators,
      size = "sm",
      max_visible = 4,
      stacked = true,
      on_collaborator_click,
      className = "",
      ...rest
    },
    ref,
  ) {
    // Sort and compute visible/overflow
    const sorted_collaborators = useMemo(() => sort_collaborators(collaborators), [collaborators]);

    const visible_collaborators = sorted_collaborators.slice(0, max_visible);
    const overflow_count = sorted_collaborators.length - max_visible;
    const has_overflow = overflow_count > 0;

    // Container classes
    const container_classes = [
      "flex items-center",
      stacked ? stack_spacing[size] : "gap-1",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    // No collaborators
    if (collaborators.length === 0) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={container_classes}
        role="group"
        aria-label={`${collaborators.length} collaborator${collaborators.length === 1 ? "" : "s"} connected`}
        {...rest}
      >
        {visible_collaborators.map((collaborator, index) => (
          <div
            key={collaborator.client_id}
            className={["relative", stacked ? "ring-2 ring-surface rounded-full" : ""]
              .filter(Boolean)
              .join(" ")}
            style={{ zIndex: max_visible - index }}
          >
            <Avatar
              name={collaborator.user.name}
              src={collaborator.user.avatar_url}
              size={avatar_size_map[size]}
              presence_status={collaborator.presence_status}
              color={collaborator.user.color}
              onClick={
                on_collaborator_click ? () => on_collaborator_click(collaborator) : undefined
              }
              className={on_collaborator_click ? "cursor-pointer" : ""}
            />
          </div>
        ))}

        {/* Overflow count badge */}
        {has_overflow && (
          <div
            className={[
              "relative flex items-center justify-center",
              "rounded-full",
              "bg-text-ghost text-white",
              "font-ui font-semibold",
              stacked ? "ring-2 ring-surface" : "",
              overflow_container_size[size],
              overflow_text_size[size],
            ].join(" ")}
            style={{ zIndex: 0 }}
            title={`${overflow_count} more collaborator${overflow_count === 1 ? "" : "s"}`}
            aria-label={`${overflow_count} more collaborators`}
          >
            +{overflow_count}
          </div>
        )}
      </div>
    );
  },
);
