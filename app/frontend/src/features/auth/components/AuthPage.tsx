import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Moon, Sun, X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { CaretLogo } from "../../../components/ui/Logo";
import { useTheme } from "../../../hooks/useTheme";
import { useAuthStore } from "../../../stores/authStore";

const SERVICE_UNAVAILABLE_MESSAGE = "Service temporarily unavailable. Please try again later.";

interface AuthPageProps {
  embedded?: boolean;
  onClose?: () => void;
}

/**
 * OAuth-only login page.
 *
 * Uses one centered Caret surface, closer to the editor than to a generic SaaS form.
 */
export function AuthPage({ embedded = false, onClose }: AuthPageProps) {
  const { t } = useTranslation("common");
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const { theme, toggleTheme } = useTheme();

  const [error, set_error] = useState<string | null>(null);
  const [isServiceError, setIsServiceError] = useState(false);
  const [isOauthLoading, setIsOauthLoading] = useState(false);

  const ThemeIcon = theme === "dark" ? Moon : Sun;
  const title_id = useId();

  useEffect(() => {
    if (!embedded || !onClose) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [embedded, onClose]);

  /** Handle Google OAuth sign-in. */
  async function handleGoogleSignIn() {
    set_error(null);
    setIsServiceError(false);
    setIsOauthLoading(true);

    const errorMessage = await signInWithGoogle();

    if (errorMessage) {
      setIsOauthLoading(false);
      console.error("Auth error:", errorMessage);
      const isService =
        errorMessage.toLowerCase().includes("network") ||
        errorMessage.toLowerCase().includes("fetch") ||
        errorMessage.toLowerCase().includes("unavailable") ||
        errorMessage.toLowerCase().includes("timeout");
      setIsServiceError(isService);
      set_error(
        isService
          ? t("settings.service_unavailable", { defaultValue: SERVICE_UNAVAILABLE_MESSAGE })
          : errorMessage,
      );
    }
  }

  const auth_surface = (
    <section className="w-full max-w-[34rem]">
      <div
        role={embedded ? "dialog" : undefined}
        aria-modal={embedded ? "true" : undefined}
        aria-labelledby={embedded ? title_id : undefined}
        className="overflow-hidden border border-border-subtle bg-surface shadow-subtle"
      >
        <div className="border-b border-border-subtle px-6 py-5 md:px-8">
          <div className="flex items-center justify-between gap-4">
            <p className="text-ui-sm uppercase tracking-[0.18em] text-text-secondary">
              {t("auth.tagline", { defaultValue: "The AI-first document editor" })}
            </p>
            {embedded && onClose ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label={t("close", { defaultValue: "Close" })}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="px-6 py-7 md:px-8 md:py-8">
          <div className="mb-7 border-b border-border-subtle pb-6">
            <div className="min-w-0">
              <h1
                id={title_id}
                className="font-document text-h2 font-normal tracking-[-0.02em] text-text-primary"
              >
                {t("auth.sign_in", { defaultValue: "Sign in" })}
              </h1>
              <p className="mt-2 max-w-md text-ui-sm text-text-secondary">
                {t("auth.google_only_hint", {
                  defaultValue: "Use your Google account to continue to Caret.",
                })}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={handleGoogleSignIn}
            disabled={isOauthLoading}
            isLoading={isOauthLoading}
            className="h-12 w-full"
          >
            {!isOauthLoading && <GoogleIcon />}
            {t("auth.continue_with_google")}
          </Button>

          {error && (
            <div className="mt-4">
              <p className="text-ui-sm text-error" role="alert">
                {error}
              </p>
              {isServiceError && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleGoogleSignIn}
                  className="mt-2"
                >
                  {t("retry", { defaultValue: "Retry" })}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );

  if (embedded) {
    return auth_surface;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-app text-text-primary">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(6,102,204,0.12),transparent_36%),radial-gradient(circle_at_top_right,rgba(255,107,53,0.08),transparent_30%)]" />
        <div className="absolute right-[4vw] top-[10vh] hidden font-document text-[16vw] leading-none text-text-primary/[0.04] lg:block">
          ^
        </div>
      </div>

      <header className="relative z-10 flex h-14 items-center justify-between border-b border-border-subtle bg-surface px-6">
        <Link to="/" className="transition-opacity hover:opacity-85">
          <CaretLogo className="gap-1.5" />
        </Link>

        <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label={t(`theme.${theme}`)}>
          <ThemeIcon className="h-5 w-5" />
        </Button>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-56px)] items-center justify-center px-6 py-14 md:py-20">
        {auth_surface}
      </main>
    </div>
  );
}

/** Google "G" logo as an inline SVG. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
