import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { use_auth_store } from "../../../stores/auth_store";
import { use_theme } from "../../../hooks/use_theme";
import { Sun, Moon, Monitor } from "lucide-react";

/** Which form is currently active. */
type AuthMode = "sign_in" | "sign_up";

/** Map theme value to its corresponding icon component. */
const theme_icons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

/**
 * Combined Login / Sign-up page.
 *
 * Renders a centered card with email+password form.
 * Uses Supabase Auth via the auth store for sign-in and sign-up.
 * Follows the "Swiss Focus" design: minimal chrome, clean typography.
 */
export function AuthPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const sign_in = use_auth_store((s) => s.sign_in);
  const sign_up = use_auth_store((s) => s.sign_up);
  const sign_in_with_oauth = use_auth_store((s) => s.sign_in_with_oauth);
  const { theme, toggle_theme } = use_theme();

  const [mode, set_mode] = useState<AuthMode>("sign_in");
  const [email, set_email] = useState("");
  const [password, set_password] = useState("");
  const [error, set_error] = useState<string | null>(null);
  const [is_loading, set_is_loading] = useState(false);
  const [is_oauth_loading, set_is_oauth_loading] = useState(false);

  const ThemeIcon = theme_icons[theme];

  /**
   * Handle Google OAuth sign-in.
   * Supabase redirects to Google, then back to the app.
   * The onAuthStateChange listener handles session detection.
   */
  async function handle_google_sign_in() {
    set_error(null);
    set_is_oauth_loading(true);

    const error_message = await sign_in_with_oauth("google");

    if (error_message) {
      set_is_oauth_loading(false);
      set_error(error_message);
    }
    /* If no error, the browser is redirecting to Google — no need to reset loading */
  }

  /**
   * Handle form submission for both sign-in and sign-up.
   * On success, navigate to the main editor page.
   */
  async function handle_submit(event: FormEvent) {
    event.preventDefault();
    set_error(null);
    set_is_loading(true);

    const action = mode === "sign_in" ? sign_in : sign_up;
    const error_message = await action(email, password);

    set_is_loading(false);

    if (error_message) {
      set_error(error_message);
      return;
    }

    /* sign_up with Supabase may require email confirmation;
       the auth state listener in the store will handle the
       transition once the session is established. */
    if (mode === "sign_in") {
      navigate("/");
    }
  }

  /** Toggle between sign-in and sign-up modes. */
  function toggle_mode() {
    set_mode((prev) => (prev === "sign_in" ? "sign_up" : "sign_in"));
    set_error(null);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-app px-4">
      {/* Theme toggle — top-right corner */}
      <div className="absolute top-4 right-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle_theme}
          aria-label={t(`theme.${theme}`)}
        >
          <ThemeIcon className="h-5 w-5" />
        </Button>
      </div>

      {/* Auth card */}
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 text-center">
          <h1 className="font-ui text-display tracking-tight text-text-primary">
            {t("app_name")}
          </h1>
          <p className="mt-2 text-ui-base text-text-secondary">
            {t("auth.tagline")}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-[6px] border border-border-subtle bg-surface p-6 shadow-subtle">
          <h2 className="mb-6 text-ui-lg text-text-primary">
            {mode === "sign_in"
              ? t("auth.welcome_back")
              : t("auth.create_account")}
          </h2>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handle_google_sign_in}
            disabled={is_oauth_loading || is_loading}
            className="flex w-full items-center justify-center gap-3 rounded-base border border-border-subtle bg-surface px-4 py-2.5 text-ui-base text-text-primary transition-colors hover:bg-app disabled:opacity-50"
          >
            <GoogleIcon />
            {t("auth.continue_with_google")}
          </button>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border-subtle" />
            <span className="text-ui-sm text-text-secondary">
              {t("auth.or_divider")}
            </span>
            <div className="h-px flex-1 bg-border-subtle" />
          </div>

          <form onSubmit={handle_submit} className="flex flex-col gap-4">
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
              autoComplete={
                mode === "sign_in" ? "current-password" : "new-password"
              }
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
              is_loading={is_loading}
              className="w-full"
            >
              {is_loading
                ? mode === "sign_in"
                  ? t("auth.signing_in")
                  : t("auth.signing_up")
                : mode === "sign_in"
                  ? t("auth.sign_in")
                  : t("auth.sign_up")}
            </Button>
          </form>

          {/* Toggle link */}
          <p className="mt-4 text-center text-ui-sm text-text-secondary">
            {mode === "sign_in"
              ? t("auth.no_account")
              : t("auth.has_account")}{" "}
            <button
              type="button"
              onClick={toggle_mode}
              className="cursor-pointer text-accent-main hover:underline"
            >
              {mode === "sign_in" ? t("auth.sign_up") : t("auth.sign_in")}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Google "G" logo as an inline SVG.
 * Uses the official brand colors for recognition.
 */
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
