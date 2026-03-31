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
import { use_auth_store } from "../../../stores/auth_store";
import { Sun, Moon, Monitor, ArrowRight, Type, Users, Sparkles } from "lucide-react";
import { CaretLogo } from "../../../components/ui/Logo";
import { AnimatedMockup } from "./AnimatedMockup";

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
    transition: { type: "spring" as const, stiffness: 110, damping: 18 },
  },
};

/* ================================================================
   Sub-components
   ================================================================ */

/**
 * Wraps children in a "magnetic" motion div.
 * On hover, the element gently follows the cursor towards its center.
 * Respects `prefers-reduced-motion` via the `disabled` prop.
 */
function MagneticButton({ children, disabled }: { children: React.ReactNode; disabled: boolean }) {
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
  variant?: "primary" | "secondary" | "tertiary";
}

/**
 * Feature card with scroll-triggered reveal and icon rotation on hover.
 * Now supports three variants for visual variety and asymmetric layout.
 */
function FeatureCard({ icon, title, description, index, variant = "secondary" }: FeatureCardProps) {
  const is_primary = variant === "primary";
  const is_tertiary = variant === "tertiary";

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay: index * 0.1 }}
      whileHover={{ y: -4, transition: { type: "spring", stiffness: 300, damping: 20 } }}
      className={`
        group relative flex flex-col overflow-hidden rounded-md border border-border-subtle bg-surface transition-all duration-300
        ${is_primary ? "gap-8 p-10 md:col-span-2 md:row-span-1" : is_tertiary ? "gap-4 p-6" : "gap-6 p-8"}
        hover:border-accent-main/30 hover:shadow-subtle
      `}
    >
      {/* Subtle hover gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent-main/3 to-accent-caret/3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <motion.div
        whileHover={{ scale: 1.08, rotate: 3 }}
        transition={{ type: "spring", stiffness: 300, damping: 18 }}
        className={`
          flex items-center justify-center rounded-base border border-border-subtle bg-app text-text-secondary
          group-hover:border-accent-caret/40 group-hover:text-accent-main transition-colors duration-300
          ${is_primary ? "h-14 w-14" : "h-12 w-12"}
        `}
      >
        {icon}
      </motion.div>

      <div className={is_primary ? "space-y-4" : "space-y-3"}>
        <h4
          className={`font-ui font-medium text-text-primary tracking-tight ${is_primary ? "text-ui-lg" : "text-[15px]"}`}
        >
          {title}
        </h4>
        <p
          className={`leading-relaxed text-text-secondary ${is_primary ? "text-[15px]" : "text-ui-base"}`}
        >
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
 * Redesigned following .impeccable.md principles:
 *  - Two-color system: Blue (UI) + Orange (user focus/AI)
 *  - Swiss rigor with human warmth
 *  - Asymmetric feature layout (not monotonous grid)
 *  - Solid surfaces instead of glassmorphism overuse
 *  - Copy that speaks to user pain points (not generic AI marketing)
 *  - Varied spacing for visual rhythm
 *
 * Motion features (gated by useReducedMotion):
 *  - Page-level scroll progress bar
 *  - Hero parallax + fade on scroll
 *  - Cursor-reactive radial background glows
 *  - Word-by-word hero headline reveal
 *  - Magnetic CTA buttons
 *  - Animated app mockup (AnimatedMockup)
 */
export function LandingPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const status = use_auth_store((s) => s.status);
  const is_authenticated = status === "authenticated";
  const { theme, toggle_theme } = use_theme();
  const should_reduce_motion = useReducedMotion() ?? false;
  const hero_ref = useRef<HTMLElement>(null);
  const { x: mouse_x, y: mouse_y } = useMousePosition();

  /* Page-level scroll drives the top progress bar */
  const { scrollYProgress: page_progress } = useScroll();

  /* Hero-section scroll drives hero parallax */
  const { scrollYProgress: hero_progress } = useScroll({
    target: hero_ref,
    offset: ["start start", "end start"],
  });
  const hero_y = useTransform(hero_progress, [0, 1], [0, 60]);
  const hero_opacity = useTransform(hero_progress, [0, 0.9], [1, 0.7]);
  const glow_opacity = useTransform(hero_progress, [0, 1], [1, 0.4]);

  /* Cursor-reactive background glows */
  const primary_glow = useMotionTemplate`radial-gradient(600px circle at ${mouse_x}px ${mouse_y}px, rgb(var(--color-accent-main-rgb) / 0.1), transparent 70%)`;
  const caret_glow = useMotionTemplate`radial-gradient(400px circle at ${mouse_x}px ${mouse_y}px, rgb(var(--color-accent-caret-rgb) / 0.05), transparent 80%)`;

  const ThemeIcon = theme_icons[theme];

  return (
    <div className="flex min-h-screen flex-col bg-app overflow-x-hidden relative z-0">
      {/* ── Scroll progress bar ─────────────────────────────────── */}
      <motion.div
        className="fixed top-0 left-0 right-0 z-[200] h-[2px] origin-left bg-gradient-to-r from-accent-main via-accent-caret to-accent-caret"
        style={{ scaleX: page_progress }}
      />

      {/* ── Background glows ────────────────────────────────────── */}
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
        className="pointer-events-none fixed top-[10vh] right-[4vw] z-[-1] hidden select-none font-document text-[16vw] font-light leading-none text-text-primary/[0.04] md:block"
        animate={should_reduce_motion ? undefined : { y: [0, -18, 0], rotate: [0, 2, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      >
        ^
      </motion.span>

      {/* ── Navigation bar (solid surface for warmth) ────────────── */}
      <header className="fixed top-0 right-0 left-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-surface px-6">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <CaretLogo />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex items-center gap-2"
        >
          <Button variant="ghost" size="sm" onClick={toggle_theme} aria-label={t(`theme.${theme}`)}>
            <ThemeIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(is_authenticated ? "/documents" : "/login")}
          >
            {is_authenticated ? "Dashboard" : t("auth.sign_in")}
          </Button>
        </motion.div>
      </header>

      {/* ── Hero (BOLDER, MASSIVE SCALE) ───────────────────────── */}
      <section
        ref={hero_ref}
        className="relative flex flex-col items-center justify-start pt-32 pb-20 md:pt-40 md:pb-24 overflow-hidden"
      >
        <motion.div
          initial="hidden"
          animate="visible"
          variants={container_variants}
          style={{
            y: should_reduce_motion ? 0 : hero_y,
            opacity: should_reduce_motion ? 1 : hero_opacity,
          }}
          className="w-full flex flex-col relative z-10"
        >
          {/* Massive Typography Hero */}
          <div className="px-6 md:px-12 w-full max-w-7xl mx-auto flex flex-col items-center text-center">
            <motion.h2
              initial="hidden"
              animate="visible"
              className="font-document text-6xl md:text-8xl lg:text-[110px] leading-[1.1] tracking-tight text-text-primary flex flex-col items-center"
            >
              <div className="flex flex-wrap justify-center gap-x-4 md:gap-x-6">
                <span>Write</span>
                <span className="italic text-text-secondary">with</span>
                <span>clarity.</span>
              </div>
              <div className="flex flex-wrap justify-center gap-x-4 md:gap-x-6 mt-2 md:mt-4">
                <span>Think</span>
                <span className="italic text-text-secondary">with</span>
                <motion.span className="text-accent-caret relative inline-block">
                  precision
                  {/* Over-the-top dot */}
                  <motion.span
                    className="absolute -right-[12px] md:-right-[24px] bottom-[10px] md:bottom-[18px] h-[10px] w-[10px] md:h-[20px] md:w-[20px] rounded-full bg-accent-caret"
                    animate={
                      should_reduce_motion
                        ? undefined
                        : { scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }
                    }
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  />
                </motion.span>
              </div>
            </motion.h2>

            {/* Centered Description & CTA */}
            <div className="mt-12 md:mt-20 flex flex-col items-center w-full">
              <motion.p
                variants={item_variants}
                className="font-ui text-xl md:text-2xl leading-relaxed text-text-secondary max-w-2xl text-center"
              >
                Stop fighting your document. Start writing. <br className="hidden md:block" />
                <span className="text-text-primary font-medium">AI-assisted.</span> Real-time
                collaborative. Distraction-free.
              </motion.p>

              <motion.div
                variants={item_variants}
                className="mt-10 flex flex-col sm:flex-row gap-4 justify-center"
              >
                <MagneticButton disabled={should_reduce_motion}>
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => navigate(is_authenticated ? "/documents" : "/login")}
                    className="min-w-[200px] h-14 text-base shadow-elevated bg-accent-main text-white border border-accent-main hover:bg-[#0052A3] transition-all duration-300"
                  >
                    <span className="flex items-center justify-center gap-2 font-medium tracking-wide">
                      {is_authenticated ? "Go to Dashboard" : "Start writing"}
                      <ArrowRight className="h-5 w-5" />
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
                    className="min-w-[200px] h-14 text-base transition-all duration-300"
                  >
                    See how it works
                  </Button>
                </MagneticButton>
              </motion.div>
            </div>
          </div>

          {/* Animated Mockup breaking the grid - Massive scale */}
          <div className="mt-20 md:mt-28 w-full px-4 md:px-12 max-w-[1400px] mx-auto relative z-20 perspective-1000">
            <AnimatedMockup />
          </div>
        </motion.div>
      </section>

      {/* ── Stats strip (BOLDER, MASSIVE SCALE) ──────────────────────── */}
      <section className="border-t border-border-subtle px-6 py-24 md:py-32">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={container_variants}
          className="mx-auto flex w-full max-w-[1400px] flex-col items-start justify-between gap-16 md:flex-row md:gap-8"
        >
          {[
            { label: "Real-time", sub: "Multiplayer editing built on CRDTs" },
            { label: "AI-native", sub: "Inline, context-aware intelligence" },
            { label: "Offline-first", sub: "Local-first sync architecture" },
          ].map(({ label, sub }) => (
            <motion.div key={label} variants={item_variants} className="flex flex-col gap-4">
              <span className="font-ui text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-text-primary">
                {label}.
              </span>
              <span className="font-ui text-lg md:text-xl text-text-secondary max-w-[280px]">
                {sub}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Features (Asymmetric layout, generous spatial rhythm) ──────── */}
      <section
        id="features"
        className="border-t border-border-subtle bg-surface px-6 py-32 md:py-48"
      >
        <div className="mx-auto w-full max-w-[1400px]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ type: "spring" as const, stiffness: 100, damping: 18 }}
            className="mb-24 md:mb-40 max-w-4xl"
          >
            <h3 className="font-document text-5xl md:text-[7vw] lg:text-[100px] leading-[0.9] tracking-tighter text-text-primary mb-8">
              Built for writers who <span className="italic text-accent-caret">value clarity.</span>
            </h3>
            <p className="text-2xl md:text-3xl text-text-secondary leading-relaxed max-w-2xl">
              Every feature serves one purpose: help you write better, faster, without friction.
              Content first. Chrome second.
            </p>
          </motion.div>

          {/* Asymmetric grid: massive primary card + two stacked secondary cards */}
          <div className="grid gap-8 md:grid-cols-12">
            <div className="md:col-span-8">
              <FeatureCard
                index={0}
                variant="primary"
                icon={<Sparkles className="h-8 w-8" />}
                title="AI writing assistant"
                description="Inline suggestions, tone adjustments, and structural feedback. AI that enhances your voice — never replaces it. No chat window. Just seamless integration right where you write."
              />
            </div>
            <div className="md:col-span-4 flex flex-col gap-8">
              <FeatureCard
                index={1}
                variant="secondary"
                icon={<Type className="h-6 w-6" />}
                title="Precision editor"
                description="Distraction-free canvas with rich typography and autosave."
              />
              <FeatureCard
                index={2}
                variant="secondary"
                icon={<Users className="h-6 w-6" />}
                title="Real-time collaboration"
                description="Live cursors and seamless edits. See changes as they happen."
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA (BOLDER) ─────────────────────────────────────────── */}
      <section className="border-t border-border-subtle bg-app px-6 py-32 md:py-48">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={container_variants}
          className="mx-auto w-full max-w-[1400px] text-center flex flex-col items-center"
        >
          <motion.div
            variants={item_variants}
            className="mb-12 h-2 w-24 bg-accent-caret rounded-full"
          />
          <motion.h3
            variants={item_variants}
            className="font-document text-6xl md:text-[8vw] lg:text-[120px] leading-[0.9] tracking-tighter text-text-primary"
          >
            Ready to write?
          </motion.h3>
          <motion.p
            variants={item_variants}
            className="mt-8 max-w-2xl text-2xl md:text-3xl text-text-secondary leading-relaxed"
          >
            No setup. No friction. Sign in and create your first document in seconds.
          </motion.p>
          <motion.div variants={item_variants} className="mt-16 inline-block">
            <MagneticButton disabled={should_reduce_motion}>
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate(is_authenticated ? "/documents" : "/login")}
                className="min-w-[240px] h-20 text-xl shadow-strong bg-accent-main text-white border-2 border-accent-main hover:bg-transparent hover:text-accent-main transition-all duration-300 rounded-none"
              >
                <span className="flex items-center justify-center gap-3 font-semibold uppercase tracking-wide">
                  {is_authenticated ? "Go to Dashboard" : "Get started free"}
                  <ArrowRight className="h-6 w-6" />
                </span>
              </Button>
            </MagneticButton>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Footer (meaningful text instead of generic filler) ────── */}
      <footer className="border-t border-border-subtle px-6 py-8">
        <div className="mx-auto flex w-full max-w-[var(--max-width-document-wide)] items-center justify-between text-ui-sm text-text-secondary">
          <span>{t("app_name")} © 2026</span>
          <span>AI-first document editing</span>
        </div>
      </footer>
    </div>
  );
}
