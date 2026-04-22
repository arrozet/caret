import { X } from "lucide-react";

interface NotificationToastProps {
  /** Toast message shown to the user. */
  message: string;
  /** Optional callback for dismissing the toast. */
  onDismiss?: () => void;
}

/**
 * Lightweight contextual toast used for share/move feedback.
 */
export function NotificationToast({ message, onDismiss }: NotificationToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 top-4 z-[100] flex max-w-sm items-start gap-3 rounded-[4px] border border-border-subtle bg-surface px-4 py-3 text-ui-sm text-text-primary shadow-elevated"
    >
      <div className="min-w-0 flex-1">{message}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-[4px] p-1 text-text-secondary hover:bg-app hover:text-text-primary"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
