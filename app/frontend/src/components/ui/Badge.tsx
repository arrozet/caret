import { type HTMLAttributes, forwardRef } from "react";

/** Size presets for the Badge component. */
type BadgeSize = "sm" | "md";

/** Badge variants for different visual styles. */
type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Size preset. Defaults to "md". */
  size?: BadgeSize;
  /** Visual variant. Defaults to "default". */
  variant?: BadgeVariant;
  /** When true, shows a pulsing animation (useful for live indicators). */
  pulse?: boolean;
  /** Optional label text. If not provided, renders as a dot indicator. */
  children?: React.ReactNode;
}

/** Size-specific classes for the badge. */
const size_classes: Record<BadgeSize, { dot: string; label: string }> = {
  sm: {
    dot: "h-2 w-2",
    label: "h-5 px-1.5 text-[10px]",
  },
  md: {
    dot: "h-2.5 w-2.5",
    label: "h-6 px-2 text-ui-sm",
  },
};

/** Variant-specific color classes. */
const variant_classes: Record<BadgeVariant, string> = {
  default: "bg-text-ghost text-white",
  success: "bg-success text-white",
  warning: "bg-warning text-white",
  error: "bg-error text-white",
  info: "bg-accent-main text-white",
};

/**
 * Reusable Badge primitive.
 *
 * A "dumb" presentation component with no business logic.
 * Can render as a simple dot indicator or as a labeled badge.
 * Optionally includes a pulse animation for live status indicators.
 *
 * Styled with Tailwind using the Swiss Focus design system tokens.
 *
 * @example
 * ```tsx
 * // Dot indicator
 * <Badge variant="success" pulse />
 *
 * // Labeled badge
 * <Badge variant="info" size="md">New</Badge>
 * ```
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { size = "md", variant = "default", pulse = false, children, className = "", ...rest },
  ref,
) {
  const is_dot = !children;

  const base_classes = [
    "inline-flex items-center justify-center",
    "rounded-full",
    "font-ui font-medium",
    variant_classes[variant],
    is_dot ? size_classes[size].dot : size_classes[size].label,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span ref={ref} className="relative inline-flex" {...rest}>
      <span className={base_classes}>{children}</span>
      {pulse && (
        <span
          className={[
            "absolute inset-0",
            "rounded-full",
            "animate-ping",
            "opacity-75",
            variant_classes[variant],
          ].join(" ")}
          aria-hidden="true"
        />
      )}
    </span>
  );
});
