import { useEffect, useRef, useCallback } from "react";

/**
 * Hook that adds/removes "focus-mode" class on the document element
 * after the user has been idle for a specified duration.
 *
 * Per FRONTEND.md §9: peripheral UI elements (`.ui-peripheral`) fade
 * to 20% opacity after 2 seconds of inactivity during editing.
 *
 * @param enabled - Whether focus mode tracking is active.
 * @param idle_ms - Idle timeout in milliseconds (default: 2000).
 */
export function use_focus_mode(enabled: boolean = true, idle_ms: number = 2_000) {
  const timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset_timer = useCallback(() => {
    /* Remove focus mode immediately on activity */
    document.documentElement.classList.remove("focus-mode");

    if (timer_ref.current) {
      clearTimeout(timer_ref.current);
    }

    if (!enabled) return;

    /* Set focus mode after idle period */
    timer_ref.current = setTimeout(() => {
      document.documentElement.classList.add("focus-mode");
    }, idle_ms);
  }, [enabled, idle_ms]);

  useEffect(() => {
    if (!enabled) {
      document.documentElement.classList.remove("focus-mode");
      return;
    }

    const events: Array<keyof DocumentEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    events.forEach((event) => document.addEventListener(event, reset_timer, { passive: true }));

    /* Start the initial timer */
    reset_timer();

    return () => {
      events.forEach((event) => document.removeEventListener(event, reset_timer));
      if (timer_ref.current) {
        clearTimeout(timer_ref.current);
      }
      document.documentElement.classList.remove("focus-mode");
    };
  }, [enabled, reset_timer]);
}
