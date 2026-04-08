import { motion, type SVGMotionProps } from "framer-motion";

export interface CaretIconProps extends SVGMotionProps<SVGSVGElement> {
  isThinking?: boolean;
  isWriting?: boolean;
}

/**
 * Caret icon component (the symbol '^').
 *
 * Styled following the "Swiss Focus" design system.
 * By default, uses the signature brand color (accent-caret).
 * Includes `isThinking` (spinning) and `isWriting` (blinking) animations for AI states.
 */
export function CaretIcon({
  className = "",
  isThinking,
  isWriting,
  style,
  ...props
}: CaretIconProps) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-accent-caret ${className}`}
      animate={
        isThinking
          ? { rotate: 360 }
          : isWriting
            ? { opacity: [1, 0.3, 1] }
            : { rotate: 0, opacity: 1 }
      }
      transition={
        isThinking
          ? { duration: 1.5, repeat: Infinity, ease: "linear" }
          : isWriting
            ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
      }
      style={{ originX: "50%", originY: "50%", ...style }}
      {...props}
    >
      <path d="M18 15l-6-6-6 6" />
    </motion.svg>
  );
}

/**
 * Full Caret logo component (icon + text).
 */
export function CaretLogo({
  className = "",
  isThinking,
  isWriting,
}: {
  className?: string;
  isThinking?: boolean;
  isWriting?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <CaretIcon className="h-6 w-6" isThinking={isThinking} isWriting={isWriting} />
      <span className="font-ui text-ui-lg font-semibold tracking-tight text-text-primary">
        Caret
      </span>
    </div>
  );
}
