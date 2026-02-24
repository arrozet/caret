import { useNavigate } from "react-router-dom";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useTranslation } from "react-i18next";
import { useEffect, useRef } from "react";
import { Button } from "../../../components/ui/Button";
import { use_theme } from "../../../hooks/use_theme";
import { Sun, Moon, Monitor, ArrowRight, Type, Users, Sparkles } from "lucide-react";
import { CaretLogo } from "../../../components/ui/Logo";

/* ================================================================
   Hooks
   ================================================================ */

/**
 * Tracks mouse position and exposes smoothed spring motion values.
 * Used to drive cursor-reactive background glows.
 */
function useMousePosition() {
  const mouse_x = useMotionValue(0);
  const mouse_y = useMotionValue(0);

  const spring_x = useSpring(mouse_x, { stiffness: 150, damping: 20 });
  const spring_y = useSpring(mouse_y, { stiffness: 150, damping: 20 });

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      mouse_x.set(e.clientX);
      mouse_y.set(e.clientY);
    };
    window.addEventListener("mousemove", handle);
    return () => window.removeEventListener("mousemove", handle);
  }, [mouse_x, mouse_y]);

  return { x: spring_x, y: spring_y };
}

/* ================================================================
   Animation Variants
   ================================================================ */

/** Stagger container: reveals children one after another. */
const container_variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.15 },
  },
};

/** Generic slide-up + fade item. */
const item_variants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 110, damping: 18 },
  },
};

/**
 * Per-word reveal variant: each word blurs in from below.
 * Uses `custom` index for staggered delay without a parent stagger.
 */
const word_variants = {
  hidden: { opacity: 0, y: "0.35em", filter: "blur(6px)" },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 120, damping: 22, delay: i * 0.065 },
  }),
};

/* ================================================================
   Sub-components
   ================================================================ */

/**
 * Renders a single word as an independently animated span.
 * Uses `word_variants` with a custom delay index.
 */
function AnimatedWord({ word, index }: { word: string; index: number }) {
  return (
    <motion.span
      custom={index}
      variants={word_variants}
      className="inline-block"
      style={{ marginRight: "0.27em" }}
    >
      {word}
    </motion.span>
  );
}

/**
 * Wraps children in a "magnetic" motion div.
 * On hover, the element gently follows the cursor towards its center.
 * Respects `prefers-reduced-motion`.
 */
function MagneticButton({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled: boolean;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const spring_x = useSpring(x, { stiffness: 260, damping: 24 });
  const spring_y = useSpring(y, { stiffness: 260, damping: 24 });

  const handle_move = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * 0.2);
    y.set((e.clientY - rect.top - rect.height / 2) * 0.2);
  };

  const handle_leave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      onMouseMove={handle_move}
      onMouseLeave={handle_leave}
      style={{ x: spring_x, y: spring_y }}
      whileTap={{ scale: 0.97 }}
    >
      {children}
    </motion.div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  index: number;
}

/**
 * Feature card with a scroll-triggered reveal and icon glow on hover.
 * `index` drives a small delay offset so cards arrive sequentially.
 */
function FeatureCard({ icon, title, description, index }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay: index * 0.1 }}
      whileHover={{ y: -6, transition: { type: "spring", stiffness: 300, damping: 20 } }}
      className="group flex flex-col gap-6 rounded-md border border-border-subtle bg-surface/40 p-8 hover:border-accent-main/30 hover:bg-surface/70 transition-colors duration-300"
    >
      <motion.div
        whileHover={{ scale: 1.12, rotate: 4 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
        className="flex h-12 w-12 items-center justify-center rounded-base border border-border-subtle bg-surface text-text-secondary group-hover:border-accent-caret/40 group-hover:text-accent-main transition-colors duration-300"
      >
        {icon}
      </motion.div>
      <div className="space-y-3">
        <h4 className="font-ui text-ui-lg font-medium text-text-primary tracking-tight">
          {title}
        </h4>
        <p className="text-ui-base leading-relaxed text-text-secondary">
          {description}
        </p>
      </div>
    </motion.div>
  );
}

/** Map theme value to its corresponding icon component. */
const theme_icons = { light: Sun, dark: Moon, system: Monitor } as const;

/* ================================================================
   Page
   ================================================================ */

/**
 * Public landing page shown to unauthenticated visitors.
 *
 * Motion features used:
 *  - Scroll progress bar (page-level useScroll)
 *  - Hero parallax + fade-out on scroll (target-level useScroll + useTransform)
 *  - Cursor-reactive radial background glows (useMotionTemplate + useSpring)
 *  - Word-by-word hero title reveal (word_variants + custom index)
 *  - Magnetic buttons (per-button useMotionValue + useSpring)
 *  - Icon micro-rotation on card hover
 *  - useReducedMotion gates all continuous/decorative animations
 *
 * Sections:
 *  1. Hero   — tagline + CTA
 *  2. Stats  — three product pillars as a social-proof strip
 *  3. Features — three capability cards
 *  4. CTA    — bottom sign-up prompt
 *  5. Footer
 */
export function LandingPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { theme, toggle_theme } = use_theme();
  const should_reduce_motion = useReducedMotion() ?? false;
  const hero_ref = useRef<HTMLElement>(null);
  const { x: mouse_x, y: mouse_y } = useMousePosition();

  /* Page-level scroll — drives the top progress bar */
  const { scrollYProgress: page_progress } = useScroll();

  /* Hero-section scroll — drives hero parallax */
  const { scrollYProgress: hero_progress } = useScroll({
    target: hero_ref,
    offset: ["start start", "end start"],
  });
  const hero_y = useTransform(hero_progress, [0, 1], [0, 60]);
  const hero_opacity = useTransform(hero_progress, [0, 0.9], [1, 0.7]);
  const glow_opacity = useTransform(hero_progress, [0, 1], [1, 0.4]);

  /* Cursor-reactive background glows */
  const primary_glow = useMotionTemplate`radial-gradient(520px circle at ${mouse_x}px ${mouse_y}px, rgb(var(--color-accent-main-rgb) / 0.13), transparent 65%)`;
  const caret_glow = useMotionTemplate`radial-gradient(360px circle at ${mouse_x}px ${mouse_y}px, rgb(var(--color-accent-caret-rgb) / 0.07), transparent 72%)`;

  const ThemeIcon = theme_icons[theme];

  /* Split headline into word arrays for per-word animation */
  const line_one = "Write with clarity.".split(" ");
  const line_two_prefix = ["Think", "with"];
  const total_prefix_words = line_one.length + line_two_prefix.length;

  return (
    <div className="flex min-h-screen flex-col bg-app overflow-x-hidden relative z-0">

      {/* ── Scroll progress bar ─────────────────────────────────── */}
      <motion.div
        className="fixed top-0 left-0 right-0 z-[200] h-[2px] origin-left bg-gradient-to-r from-accent-main via-accent-caret to-accent-caret"
        style={{ scaleX: page_progress }}
      />

      {/* ── Background glows (cursor-reactive) ─────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-[-1]">
        <div className="absolute inset-0 bg-app" />
        <motion.div
          className="absolute inset-0 hidden md:block"
          style={{
            background: primary_glow,
            opacity: should_reduce_motion ? 0.6 : glow_opacity,
          }}
        />
        <motion.div
          className="absolute inset-0 hidden md:block mix-blend-screen"
          style={{ background: caret_glow }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgb(var(--color-app-bg))_90%)]" />
      </div>

      {/* ── Decorative floating ^ ───────────────────────────────── */}
      <motion.span
        aria-hidden
        className="pointer-events-none fixed top-[12vh] right-[6vw] z-[-1] hidden select-none font-document text-[18vw] font-light leading-none text-text-primary/[0.03] md:block"
        animate={should_reduce_motion ? undefined : {
          y: [0, -20, 0],
          rotate: [0, 2, 0],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      >
        ^
      </motion.span>

      {/* ── Navigation bar ──────────────────────────────────────── */}
      <header className="fixed top-0 right-0 left-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-surface/90 px-6 backdrop-blur-glass">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <CaretLogo />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="flex items-center gap-2"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle_theme}
            aria-label={t(`theme.${theme}`)}
          >
            <ThemeIcon className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate("/login")}>
            {t("auth.sign_in")}
          </Button>
        </motion.div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section
        ref={hero_ref}
        className="relative flex flex-1 flex-col items-center justify-center px-6 pt-14"
      >
        <motion.div
          initial="hidden"
          animate="visible"
          variants={container_variants}
          style={{
            y: should_reduce_motion ? 0 : hero_y,
            opacity: should_reduce_motion ? 1 : hero_opacity,
          }}
          className="mx-auto w-full max-w-[var(--max-width-document-wide)] py-24 text-center md:py-32"
        >
          {/* Accent line with traveling dot */}
          <motion.div variants={item_variants} className="mx-auto mb-10 flex items-center justify-center">
            <div className="relative h-px w-16 bg-accent-caret/40">
              <motion.span
                className="absolute -top-[2px] h-[5px] w-[5px] rounded-full bg-accent-caret"
                animate={should_reduce_motion ? undefined : { x: [0, 58, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </motion.div>

          {/* Word-by-word headline */}
          <motion.h2
            initial="hidden"
            animate="visible"
            aria-label="Write with clarity. Think with precision."
            className="font-document text-display leading-tight tracking-tight md:text-[64px] md:leading-[1.06]"
          >
            <span className="block text-text-primary">
              {line_one.map((word, i) => (
                <AnimatedWord key={`l1-${i}`} word={word} index={i} />
              ))}
            </span>
            <span className="block">
              {line_two_prefix.map((word, i) => (
                <AnimatedWord key={`l2-${i}`} word={word} index={line_one.length + i} />
              ))}
              {/* Accented "precision" with animated gradient */}
              <motion.span
                custom={total_prefix_words}
                variants={word_variants}
                className="inline-block bg-gradient-to-r from-accent-main to-accent-caret bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient-x"
                style={{ marginRight: "0em" }}
              >
                precision
              </motion.span>
              <motion.span
                custom={total_prefix_words + 1}
                variants={word_variants}
                className="inline-block text-text-primary"
              >
                .
              </motion.span>
            </span>
          </motion.h2>

          <motion.p
            variants={item_variants}
            className="mx-auto mt-8 max-w-md text-body leading-relaxed text-text-secondary"
          >
            A focused writing environment where every element serves the text.
            AI-assisted, real-time collaborative, distraction-free.
          </motion.p>

          <motion.div
            variants={item_variants}
            className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          >
            <MagneticButton disabled={should_reduce_motion}>
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate("/login")}
                className="min-w-[180px] shadow-subtle group/btn relative overflow-hidden"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:animate-shimmer" />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  Get started
                  <motion.span
                    animate={should_reduce_motion ? undefined : { x: [0, 3, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="inline-flex"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </motion.span>
                </span>
              </Button>
            </MagneticButton>

            <MagneticButton disabled={should_reduce_motion}>
              <Button
                variant="secondary"
                size="lg"
                onClick={() =>
                  document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })
                }
                className="min-w-[180px]"
              >
                Learn more
              </Button>
            </MagneticButton>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Stats strip ────────────────────────────────────────── */}
      <section className="border-t border-border-subtle/60 px-6 py-12">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={container_variants}
          className="mx-auto flex w-full max-w-[var(--max-width-document-wide)] flex-col items-center justify-around gap-8 sm:flex-row"
        >
          {[
            { label: "Real-time", sub: "Collaboration" },
            { label: "AI-native", sub: "Writing assistant" },
            { label: "Offline-first", sub: "Document editor" },
          ].map(({ label, sub }, i) => (
            <motion.div
              key={label}
              variants={item_variants}
              className="flex flex-col items-center gap-1"
            >
              <span className="font-ui text-xl font-semibold text-text-primary">{label}</span>
              <span className="font-ui text-ui-sm uppercase tracking-widest text-text-secondary">
                {sub}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Features ───────────────────────────────────────────── */}
      <section id="features" className="border-t border-border-subtle bg-surface px-6 py-24">
        <div className="mx-auto w-full max-w-[var(--max-width-document-wide)]">
          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ type: "spring", stiffness: 100, damping: 18 }}
            className="mb-16 text-center font-ui text-h3 tracking-tight text-text-primary"
          >
            Built for writers who care about clarity
          </motion.h3>

          <div className="grid gap-8 md:grid-cols-3">
            <FeatureCard
              index={0}
              icon={<Type className="h-5 w-5" />}
              title="Precision Editor"
              description="A distraction-free writing canvas with rich typography, autosave, and keyboard-driven formatting. Content first, chrome second."
            />
            <FeatureCard
              index={1}
              icon={<Users className="h-5 w-5" />}
              title="Real-time Collaboration"
              description="Work together seamlessly with live cursors and presence indicators. See changes as they happen, resolve conflicts automatically."
            />
            <FeatureCard
              index={2}
              icon={<Sparkles className="h-5 w-5" />}
              title="AI Writing Assistant"
              description="Inline suggestions, tone adjustments, and structural feedback that respect your voice. AI that assists, never replaces."
            />
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ─────────────────────────────────────────── */}
      <section className="border-t border-border-subtle bg-app px-6 py-24">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={container_variants}
          className="mx-auto w-full max-w-[var(--max-width-document-wide)] text-center"
        >
          <motion.div variants={item_variants} className="mx-auto mb-8 h-px w-16 bg-accent-caret" />
          <motion.h3
            variants={item_variants}
            className="font-document text-h2 tracking-tight text-text-primary"
          >
            Start writing today
          </motion.h3>
          <motion.p
            variants={item_variants}
            className="mx-auto mt-4 max-w-sm text-ui-lg text-text-secondary"
          >
            No setup required. Sign in and create your first document in seconds.
          </motion.p>
          <motion.div variants={item_variants} className="mt-8 inline-block">
            <MagneticButton disabled={should_reduce_motion}>
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate("/login")}
                className="min-w-[200px] shadow-elevated"
              >
                Create your first document
                <ArrowRight className="h-4 w-4" />
              </Button>
            </MagneticButton>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-border-subtle px-6 py-6">
        <div className="mx-auto flex w-full max-w-[var(--max-width-document-wide)] items-center justify-between">
          <span className="text-ui-sm text-text-secondary">{t("app_name")}</span>
          <span className="text-ui-sm text-text-secondary">Crafted with precision</span>
        </div>
      </footer>
    </div>
  );
}
