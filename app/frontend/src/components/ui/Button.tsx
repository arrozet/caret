import { type ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";

/** Visual variants for the Button component. */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** Size presets for the Button component. */
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant. Defaults to "primary". */
  variant?: ButtonVariant;
  /** Size preset. Defaults to "md". */
  size?: ButtonSize;
  /** When true, shows a spinner and disables interaction. */
  isLoading?: boolean;
}

/**
 * Base style classes shared by all button variants.
 * Follows FRONTEND.md §5 (border radius: radius-base = 4px),
 * §11 (button press: 100ms ease-in-out), §12 (interactive states).
 */
const baseClasses = [
  "inline-flex items-center justify-center gap-2",
  "font-medium",
  "rounded-[4px]",
  "cursor-pointer",
  "transition-all duration-[100ms] ease-in-out",
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
  "active:scale-[0.98]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
].join(" ");

/** Variant-specific classes. */
const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    "bg-accent-main text-white",
    "hover:brightness-90",
    "focus-visible:ring-accent-main",
  ].join(" "),
  secondary: [
    "bg-transparent",
    "text-text-primary",
    "border border-border-subtle",
    "hover:bg-surface",
    "focus-visible:ring-accent-main",
  ].join(" "),
  ghost: [
    "bg-transparent",
    "text-text-secondary",
    "hover:text-text-primary hover:bg-surface",
    "focus-visible:ring-accent-main",
  ].join(" "),
  danger: ["bg-error text-white", "hover:brightness-90", "focus-visible:ring-error"].join(" "),
};

/** Size-specific classes (padding + font size). */
const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-ui-sm",
  md: "px-4 py-2 text-ui-base",
  lg: "px-6 py-3 text-ui-lg",
};

/**
 * Reusable Button primitive.
 *
 * A "dumb" presentation component with no business logic.
 * Styled with Tailwind using the Swiss Focus design system tokens.
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="md" onClick={handle_click}>
 *   Save
 * </Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    isLoading = false,
    disabled,
    className = "",
    children,
    ...rest
  },
  ref,
) {
  const combinedClasses = [baseClasses, variantClasses[variant], sizeClasses[size], className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      className={combinedClasses}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...rest}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
