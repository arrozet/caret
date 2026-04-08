import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Label text displayed above the input. */
  label?: string;
  /** Error message displayed below the input. Triggers error styling. */
  error?: string;
  /** Unique identifier — required when label is provided for accessibility. */
  id?: string;
}

/**
 * Base style classes for the input element.
 * Follows FRONTEND.md §12 (input states) and §5 (radius-base = 4px).
 */
const inputClasses = [
  "block w-full",
  "rounded-[4px]",
  "border border-border-subtle",
  "bg-surface",
  "px-3 py-2",
  "text-ui-base text-text-primary",
  "placeholder:text-text-secondary",
  "transition-all duration-[150ms] ease-out",
  "focus:outline-none focus:border-accent-main focus:ring-[3px] focus:ring-accent-main/40",
  "disabled:bg-app disabled:opacity-60 disabled:cursor-not-allowed",
].join(" ");

/** Error-state overrides. */
const errorClasses = "border-error focus:border-error focus:ring-error/40";

/**
 * Reusable Input primitive.
 *
 * A "dumb" presentation component with no business logic.
 * Styled with Tailwind using the Swiss Focus design system tokens.
 *
 * @example
 * ```tsx
 * <Input
 *   id="email"
 *   label="Email"
 *   type="email"
 *   placeholder="you@example.com"
 *   error={form_errors.email}
 * />
 * ```
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className = "", ...rest },
  ref,
) {
  const combinedClasses = [inputClasses, error ? errorClasses : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-ui-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={combinedClasses}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error && id ? `${id}-error` : undefined}
        {...rest}
      />
      {error && (
        <p id={id ? `${id}-error` : undefined} className="text-ui-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
