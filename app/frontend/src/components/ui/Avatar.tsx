import { type HTMLAttributes, forwardRef } from "react";

/** Size presets for the Avatar component. */
type AvatarSize = "sm" | "md" | "lg";

/** Presence status for the indicator dot. */
type PresenceStatus = "online" | "away" | "offline";

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  /** User's display name (first letter used for initials). */
  name?: string;
  /** Avatar image URL. If provided, displays image instead of initials. */
  src?: string;
  /** Size preset. Defaults to "md". */
  size?: AvatarSize;
  /** Presence indicator status. If undefined, no indicator is shown. */
  presence_status?: PresenceStatus;
  /** Custom color for the avatar background (hex or Tailwind class). */
  color?: string;
}

/** Size-specific classes for the avatar container. */
const sizeClasses: Record<AvatarSize, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-ui-sm",
  lg: "h-10 w-10 text-ui-base",
};

/** Size-specific classes for the presence indicator dot. */
const presenceDotSizes: Record<AvatarSize, string> = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
};

/** Presence status color classes. */
const presenceColors: Record<PresenceStatus, string> = {
  online: "bg-success",
  away: "bg-warning",
  offline: "bg-error",
};

/**
 * Extracts initials from a name string.
 * Returns first letter uppercase, or "?" if no valid name provided.
 *
 * @param name - The user's display name.
 * @returns Single uppercase letter or "?".
 */
function getInitials(name?: string): string {
  if (!name || name.trim().length === 0) {
    return "?";
  }
  return name.trim().charAt(0).toUpperCase();
}

/**
 * Reusable Avatar primitive.
 *
 * A "dumb" presentation component with no business logic.
 * Displays user avatars as circular elements with initials or images,
 * optionally showing a presence indicator dot.
 *
 * Styled with Tailwind using the Swiss Focus design system tokens.
 *
 * @example
 * ```tsx
 * <Avatar name="Alice" size="md" presence_status="online" />
 * <Avatar src="/avatar.jpg" size="lg" />
 * ```
 */
export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(function Avatar(
  { name, src, size = "md", presence_status, color, className = "", ...rest },
  ref,
) {
  const initials = getInitials(name);

  // Base container classes
  const containerClasses = [
    "relative inline-flex items-center justify-center",
    "rounded-full",
    "font-ui font-semibold",
    "select-none",
    "overflow-hidden",
    sizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Background style: custom color or default accent
  const backgroundStyle = color ? { backgroundColor: color } : undefined;

  const backgroundClass = color ? "text-white" : "bg-accent-main/10 text-accent-main";

  return (
    <div
      ref={ref}
      className={`${containerClasses} ${backgroundClass}`}
      style={backgroundStyle}
      title={name}
      aria-label={name ? `Avatar for ${name}` : "User avatar"}
      {...rest}
    >
      {src ? (
        <img
          src={src}
          alt={name ? `${name}'s avatar` : "User avatar"}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}

      {/* Presence indicator dot */}
      {presence_status && (
        <span
          className={[
            "absolute bottom-0 right-0",
            "rounded-full",
            "ring-2 ring-surface",
            presenceDotSizes[size],
            presenceColors[presence_status],
          ].join(" ")}
          aria-label={`Status: ${presence_status}`}
        />
      )}
    </div>
  );
});
