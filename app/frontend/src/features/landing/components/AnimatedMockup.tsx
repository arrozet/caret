import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

/* ── Demo content ──────────────────────────────────────────────── */

/** Words that appear in the document, typed one at a time. */
const DEMO_WORDS = [
  "Write", "something", "great", "today.",
  "Every", "word", "has", "purpose.",
];

/** User message in the AI panel. */
const DEMO_USER_MSG = "Make it punchier";

/** AI response, streamed character by character. */
const DEMO_AI_MSG = 'Try: "Every word shapes the world."';

/* ── Hooks ─────────────────────────────────────────────────────── */

/**
 * Applies a 3-D perspective tilt to an element based on mouse position
 * relative to the element's center. Spring-smoothed for natural feel.
 */
function useCardTilt(strength = 5, disabled = false) {
  const el_ref = useRef<HTMLDivElement>(null);
  const raw_rx = useMotionValue(0);
  const raw_ry = useMotionValue(0);
  const rx = useSpring(raw_rx, { stiffness: 200, damping: 28 });
  const ry = useSpring(raw_ry, { stiffness: 200, damping: 28 });

  useEffect(() => {
    if (disabled) return;
    const el = el_ref.current;
    if (!el) return;

    const on_move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      raw_rx.set(((e.clientY - r.top - r.height / 2) / (r.height / 2)) * -strength);
      raw_ry.set(((e.clientX - r.left - r.width / 2) / (r.width / 2)) * strength);
    };
    const on_leave = () => {
      raw_rx.set(0);
      raw_ry.set(0);
    };

    el.addEventListener("mousemove", on_move);
    el.addEventListener("mouseleave", on_leave);
    return () => {
      el.removeEventListener("mousemove", on_move);
      el.removeEventListener("mouseleave", on_leave);
    };
  }, [disabled, raw_rx, raw_ry, strength]);

  return { el_ref, rx, ry };
}

/* ── Component ─────────────────────────────────────────────────── */

/**
 * Animated app mockup shown in the landing hero.
 *
 * Simulates a live editing session inside a browser chrome:
 *  - Document words type in one at a time with a blinking orange cursor
 *  - A user message appears in the AI panel
 *  - An AI response streams in character by character
 *  - The card tilts in 3-D toward the cursor (useCardTilt)
 *  - Marked aria-hidden — purely decorative, not interactive
 *  - All continuous animations are gated by useReducedMotion
 *
 * Forces the `.dark` class so the mockup always renders in dark
 * theme regardless of the user's current preference.
 */
export function AnimatedMockup() {
  const should_reduce = useReducedMotion() ?? false;
  const { el_ref, rx, ry } = useCardTilt(5, should_reduce);

  const [visible_words, set_visible_words] = useState(0);
  const [show_user_msg, set_show_user_msg] = useState(false);
  const [streaming, set_streaming] = useState(false);
  const [visible_ai_chars, set_visible_ai_chars] = useState(0);

  /* Animation loop — async state machine with `live` guard */
  useEffect(() => {
    if (should_reduce) {
      set_visible_words(DEMO_WORDS.length);
      set_show_user_msg(true);
      set_streaming(false);
      set_visible_ai_chars(DEMO_AI_MSG.length);
      return;
    }

    let live = true;
    const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

    (async () => {
      while (live) {
        set_visible_words(0);
        set_show_user_msg(false);
        set_streaming(false);
        set_visible_ai_chars(0);

        await sleep(500);

        for (let i = 1; i <= DEMO_WORDS.length; i++) {
          if (!live) return;
          set_visible_words(i);
          await sleep(145);
        }

        await sleep(700);
        if (!live) break;

        set_show_user_msg(true);

        await sleep(900);
        if (!live) break;

        set_streaming(true);
        for (let i = 1; i <= DEMO_AI_MSG.length; i++) {
          if (!live) return;
          set_visible_ai_chars(i);
          await sleep(22);
        }
        if (!live) break;
        set_streaming(false);

        await sleep(3500);
      }
    })();

    return () => {
      live = false;
    };
  }, [should_reduce]);

  const cursor_blink = {
    animate: { opacity: [1, 0, 1] as number[] },
    transition: { duration: 0.9, repeat: Infinity, ease: "linear" as const },
  };

  return (
    <motion.div
      ref={el_ref}
      initial={{ opacity: 0, y: 32, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 85, damping: 20, delay: 0.55 }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
      aria-hidden="true"
      /* Force dark theme inside the mockup regardless of user preference */
      className="dark w-full select-none overflow-hidden rounded-xl border border-border-subtle shadow-strong"
    >
      {/* ── Browser chrome ────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-border-subtle bg-[#0A0A0B] px-3 py-2.5">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded bg-border-subtle/20 px-2.5 py-1 font-ui text-[10px] text-text-secondary">
          <span className="font-bold text-accent-caret">^</span>
          <span>caret.app</span>
        </div>
        <div className="w-[42px]" />
      </div>

      {/* ── App top bar ───────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold leading-none text-accent-caret">^</span>
          <span className="font-ui text-[11px] font-semibold text-text-primary">Caret</span>
        </div>
        <span className="font-ui text-[10px] text-text-secondary">Untitled document</span>
        <div className="flex items-center gap-2">
          {/* Collaboration presence avatars */}
          <div className="flex -space-x-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#0A0A0B] bg-accent-main font-ui text-[8px] font-bold text-white">
              A
            </div>
            <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#0A0A0B] bg-accent-ai font-ui text-[8px] font-bold text-white">
              B
            </div>
          </div>
          <div className="rounded-sm border border-accent-ai/40 px-1.5 py-0.5 font-ui text-[9px] font-medium text-accent-ai">
            AI
          </div>
        </div>
      </div>

      {/* ── Editor + AI panel ─────────────────────────────────── */}
      <div className="flex min-h-[200px] bg-app">

        {/* Document area */}
        <div className="flex-1 px-6 py-5 font-document text-[13px] leading-loose text-text-primary">
          <span>{DEMO_WORDS.slice(0, visible_words).join(" ")}</span>
          <motion.span
            className="ml-[2px] inline-block h-[0.85em] w-[2px] align-text-bottom bg-accent-caret"
            {...cursor_blink}
          />
        </div>

        {/* AI panel */}
        <div className="flex w-44 flex-col border-l border-border-subtle">
          <div className="flex items-center gap-1.5 border-b border-border-subtle bg-accent-ai/10 px-2.5 py-2">
            <Sparkles className="h-3 w-3 text-accent-ai" />
            <span className="font-ui text-[9px] font-medium text-accent-ai">AI Assistant</span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-hidden p-2.5 font-ui text-[9px]">
            <AnimatePresence>
              {show_user_msg && (
                <motion.div
                  key="user"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 220, damping: 20 }}
                  className="ml-3 rounded-sm bg-surface/80 px-2 py-1.5 text-text-primary"
                >
                  {DEMO_USER_MSG}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {(streaming || visible_ai_chars > 0) && (
                <motion.div
                  key="ai"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 220, damping: 20 }}
                  className="mr-2 text-text-secondary"
                >
                  {DEMO_AI_MSG.slice(0, visible_ai_chars)}
                  {streaming && (
                    <motion.span
                      className="ml-0.5 inline-block h-[0.7em] w-[2px] align-text-bottom bg-accent-ai"
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
