import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { CaretLogo } from "../../../components/ui/Logo";
import { useTheme } from "../../../hooks/useTheme";
import { useAuthStore } from "../../../stores/authStore";

/** Which form is currently active. */
type AuthMode = "sign_in" | "sign_up";

/**
 * Combined Login / Sign-up page.
 *
 * Uses one centered Caret surface, closer to the editor than to a generic SaaS form.
 */
export function AuthPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);
  const signInWithOauth = useAuthStore((state) => state.signInWithOauth);
  const { theme, toggleTheme } = useTheme();

  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [email, set_email] = useState("");
  const [password, set_password] = useState("");
  const [error, set_error] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOauthLoading, setIsOauthLoading] = useState(false);

  const is_sign_in = mode === "sign_in";
  const ThemeIcon = theme === "dark" ? Moon : Sun;
  const panel_title = is_sign_in ? "Sign in" : "Create account";
  const primary_action = is_sign_in ? t("auth.sign_in") : t("auth.sign_up");

  /** Handle Google OAuth sign-in. */
  async function handleGoogleSignIn() {
    set_error(null);
    setIsOauthLoading(true);

    const errorMessage = await signInWithOauth("google");

    if (errorMessage) {
      setIsOauthLoading(false);
      set_error(errorMessage);
    }
  }

  /** Handle form submission for sign-in and sign-up. */
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    set_error(null);
    setIsLoading(true);

    const action = is_sign_in ? signIn : signUp;
    const errorMessage = await action(email, password);

    setIsLoading(false);

    if (errorMessage) {
      set_error(errorMessage);
      return;
    }

    if (is_sign_in) {
      navigate("/documents");
    }
  }

  /** Toggle between sign-in and sign-up modes. */
  function toggleMode() {
    setMode((prev) => (prev === "sign_in" ? "sign_up" : "sign_in"));
    set_error(null);
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
        <section className="w-full max-w-[30rem]">
          <div className="relative">
            <div className="absolute -top-4 left-6 h-px w-20 bg-accent-caret" />

            <div className="overflow-hidden rounded-[6px] border border-border-subtle bg-surface shadow-subtle">
              <div className="border-b border-border-subtle bg-app/40 px-6 py-4 md:px-7">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-ui-sm uppercase tracking-[0.18em] text-text-secondary">
                    {t("auth.tagline", { defaultValue: "The AI-first document editor" })}
                  </p>
                  <div className="h-2 w-14 bg-accent-caret" />
                </div>
              </div>

              <div className="px-6 py-6 md:px-7 md:py-7">
                <div className="mb-6 flex items-start justify-between gap-4 border-b border-border-subtle pb-5">
                  <div className="min-w-0">
                    <h1 className="font-document text-h2 font-normal tracking-[-0.02em] text-text-primary">
                      {panel_title}
                    </h1>
                  </div>
                  <div className="mt-1 h-9 w-9 shrink-0 rounded-full border border-border-subtle bg-app" />
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleGoogleSignIn}
                  disabled={isOauthLoading || isLoading}
                  isLoading={isOauthLoading}
                  className="h-12 w-full"
                >
                  {!isOauthLoading && <GoogleIcon />}
                  {t("auth.continue_with_google")}
                </Button>

                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border-subtle" />
                  <span className="text-ui-sm text-text-secondary">{t("auth.or_divider")}</span>
                  <div className="h-px flex-1 bg-border-subtle" />
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <Input
                    id="email"
                    label={t("auth.email")}
                    type="email"
                    placeholder={t("auth.email_placeholder")}
                    value={email}
                    onChange={(e) => set_email(e.target.value)}
                    required
                    autoComplete="email"
                  />

                  <Input
                    id="password"
                    label={t("auth.password")}
                    type="password"
                    placeholder={t("auth.password_placeholder")}
                    value={password}
                    onChange={(e) => set_password(e.target.value)}
                    required
                    autoComplete={is_sign_in ? "current-password" : "new-password"}
                    minLength={6}
                  />

                  {error && (
                    <p className="text-ui-sm text-error" role="alert">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={isLoading}
                    className="h-12 w-full"
                  >
                    {isLoading
                      ? is_sign_in
                        ? t("auth.signing_in")
                        : t("auth.signing_up")
                      : primary_action}
                  </Button>
                </form>

                <p className="mt-5 text-center text-ui-sm text-text-secondary">
                  {is_sign_in ? t("auth.no_account") : t("auth.has_account")}{" "}
                  <button
                    type="button"
                    onClick={toggleMode}
                    className="cursor-pointer text-accent-main hover:text-accent-caret hover:underline"
                  >
                    {is_sign_in ? t("auth.sign_up") : t("auth.sign_in")}
                  </button>
                </p>
              </div>
            </div>
          </div>
        </section>
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
