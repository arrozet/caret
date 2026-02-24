import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui/Button";
import { use_theme } from "../../../hooks/use_theme";
import { Sun, Moon, Monitor, ArrowRight, Type, Users, Sparkles } from "lucide-react";

/** Map theme value to its corresponding icon component. */
const theme_icons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

/**
 * Public landing page shown to unauthenticated visitors.
 *
 * Follows "Swiss Focus" design: rigorous grid, minimal decoration,
 * high-end digital paper aesthetic. Content is king.
 *
 * Sections:
 *   1. Hero — tagline + primary CTA
 *   2. Features — three pillars (Editor, Collaboration, AI)
 *   3. Footer CTA — final sign-up prompt
 */
export function LandingPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { theme, toggle_theme } = use_theme();

  const ThemeIcon = theme_icons[theme];

  return (
    <div className="flex min-h-screen flex-col bg-app">
      {/* ── Navigation bar ─────────────────────────────────── */}
      <header className="fixed top-0 right-0 left-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-surface px-6">
        <h1 className="font-ui text-ui-lg font-semibold tracking-tight text-text-primary">
          {t("app_name")}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle_theme}
            aria-label={t(`theme.${theme}`)}
          >
            <ThemeIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate("/login")}
          >
            {t("auth.sign_in")}
          </Button>
        </div>
      </header>

      {/* ── Hero section ───────────────────────────────────── */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 pt-14">
        <div className="mx-auto w-full max-w-[var(--max-width-document-wide)] py-24 text-center md:py-32">
          {/* Accent line */}
          <div className="mx-auto mb-8 h-px w-16 bg-accent-caret" />

          <h2 className="font-document text-display leading-tight tracking-tight text-text-primary md:text-[40px] md:leading-tight">
            Write with clarity.
            <br />
            Think with precision.
          </h2>

          <p className="mx-auto mt-6 max-w-md text-body leading-relaxed text-text-secondary">
            A focused writing environment where every element serves the
            text. AI-assisted, real-time collaborative, distraction-free.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate("/login")}
              className="min-w-[180px]"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                document.getElementById("features")?.scrollIntoView({
                  behavior: "smooth",
                });
              }}
              className="min-w-[180px]"
            >
              Learn more
            </Button>
          </div>
        </div>
      </section>

      {/* ── Features section ───────────────────────────────── */}
      <section
        id="features"
        className="border-t border-border-subtle bg-surface px-6 py-24"
      >
        <div className="mx-auto w-full max-w-[var(--max-width-document-wide)]">
          <h3 className="mb-16 text-center font-ui text-h3 tracking-tight text-text-primary">
            Built for writers who care about craft
          </h3>

          <div className="grid gap-12 md:grid-cols-3">
            <FeatureCard
              icon={<Type className="h-5 w-5" />}
              title="Swiss Focus Editor"
              description="A distraction-free writing canvas with rich typography, autosave, and keyboard-driven formatting. Content first, chrome second."
            />
            <FeatureCard
              icon={<Users className="h-5 w-5" />}
              title="Real-time Collaboration"
              description="Work together seamlessly with live cursors and presence indicators. See changes as they happen, resolve conflicts automatically."
            />
            <FeatureCard
              icon={<Sparkles className="h-5 w-5" />}
              title="AI Writing Assistant"
              description="Inline suggestions, tone adjustments, and structural feedback that respect your voice. AI that assists, never replaces."
            />
          </div>
        </div>
      </section>

      {/* ── Bottom CTA section ─────────────────────────────── */}
      <section className="border-t border-border-subtle px-6 py-24">
        <div className="mx-auto w-full max-w-[var(--max-width-document-wide)] text-center">
          <div className="mx-auto mb-8 h-px w-16 bg-accent-caret" />
          <h3 className="font-document text-h2 tracking-tight text-text-primary">
            Start writing today
          </h3>
          <p className="mx-auto mt-4 max-w-sm text-ui-lg text-text-secondary">
            No setup required. Sign in and create your first document in seconds.
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate("/login")}
            className="mt-8 min-w-[200px]"
          >
            Create your first document
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-border-subtle px-6 py-6">
        <div className="mx-auto flex w-full max-w-[var(--max-width-document-wide)] items-center justify-between">
          <span className="text-ui-sm text-text-secondary">
            {t("app_name")}
          </span>
          <span className="text-ui-sm text-text-secondary">
            Crafted with precision
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ================================================================
   Sub-components
   ================================================================ */

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

/**
 * Feature card — icon + title + description.
 * Uses sharp corners (radius-none) per Swiss Focus spec.
 */
function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-10 w-10 items-center justify-center border border-border-subtle text-accent-main">
        {icon}
      </div>
      <h4 className="font-ui text-ui-lg font-medium text-text-primary">
        {title}
      </h4>
      <p className="text-ui-base leading-relaxed text-text-secondary">
        {description}
      </p>
    </div>
  );
}
