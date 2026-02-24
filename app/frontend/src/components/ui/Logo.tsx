import type { SVGProps } from "react";

/**
 * Caret icon component (the symbol '^').
 * 
 * Styled following the "Swiss Focus" design system.
 * By default, uses the signature brand color (accent-caret).
 */
export function CaretIcon({ className = "", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-accent-caret ${className}`}
      {...props}
    >
      <path d="M18 15l-6-6-6 6" />
    </svg>
  );
}

/**
 * Full Caret logo component (icon + text).
 */
export function CaretLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <CaretIcon className="h-6 w-6" />
      <span className="font-ui text-ui-lg font-semibold tracking-tight text-text-primary">
        Caret
      </span>
    </div>
  );
}
