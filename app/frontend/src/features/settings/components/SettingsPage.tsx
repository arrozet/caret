import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  User,
  Globe,
  Palette,
  Sun,
  Moon,
  Monitor,
  Check,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { use_auth_store } from "../../../stores/auth_store";
import { use_theme } from "../../../hooks/use_theme";

/** Supported languages with display labels. */
const LANGUAGES = [
  { code: "en-US", label: "English", flag: "EN" },
  { code: "es", label: "Espanol", flag: "ES" },
  { code: "fr", label: "Francais", flag: "FR" },
  { code: "de", label: "Deutsch", flag: "DE" },
  { code: "pt", label: "Portugues", flag: "PT" },
] as const;

/** Theme options. */
const THEMES = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
] as const;

/**
 * Settings page.
 *
 * Provides user access to profile information, language selection,
 * and theme preferences. Follows the Swiss Focus design system.
 *
 * FRONTEND.md §8 (i18n), §16 (Theme Toggle Strategy).
 */
export function SettingsPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("common");
  const user = use_auth_store((s) => s.user);
  const sign_out = use_auth_store((s) => s.sign_out);
  const { theme, set_theme } = use_theme();

  const current_language = i18n.language;

  /** Change the application language. */
  const handle_language_change = useCallback(
    (lang_code: string) => {
      i18n.changeLanguage(lang_code);
    },
    [i18n],
  );

  /** Navigate back. */
  const handle_back = useCallback(() => {
    navigate("/documents");
  }, [navigate]);

  /** Sign out and redirect. */
  const handle_sign_out = useCallback(async () => {
    await sign_out();
    navigate("/login");
  }, [sign_out, navigate]);

  return (
    <div className="flex flex-1 flex-col p-4 md:p-8">
      <div className="mx-auto w-full max-w-[var(--max-width-document)]">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handle_back}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t("settings.back", { defaultValue: "Back" })}</span>
          </Button>
          <h1 className="font-ui text-display text-text-primary">
            {t("settings.title", { defaultValue: "Settings" })}
          </h1>
        </div>

        {/* Sections */}
        <div className="space-y-8">
          {/* ---- Profile Section ---- */}
          <SettingsSection
            icon={<User className="h-5 w-5" />}
            title={t("settings.profile", { defaultValue: "Profile" })}
          >
            <div className="space-y-4">
              {/* Avatar + email */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-main/10 text-accent-main font-ui text-ui-lg font-semibold">
                  {user?.email?.charAt(0).toUpperCase() || "?"}
                </div>
                <div>
                  <p className="text-ui-lg font-medium text-text-primary">
                    {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User"}
                  </p>
                  <p className="text-ui-sm text-text-secondary">
                    {user?.email || "No email"}
                  </p>
                </div>
              </div>

              {/* Account info */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-base border border-border-subtle p-3">
                  <p className="text-ui-sm text-text-secondary mb-1">
                    {t("settings.account_id", { defaultValue: "Account ID" })}
                  </p>
                  <p className="text-ui-sm text-text-primary font-mono truncate">
                    {user?.id || "N/A"}
                  </p>
                </div>
                <div className="rounded-base border border-border-subtle p-3">
                  <p className="text-ui-sm text-text-secondary mb-1">
                    {t("settings.provider", { defaultValue: "Auth Provider" })}
                  </p>
                  <p className="text-ui-sm text-text-primary capitalize">
                    {user?.app_metadata?.provider || "email"}
                  </p>
                </div>
              </div>

              {/* Sign out button */}
              <div className="pt-2">
                <Button variant="secondary" size="md" onClick={handle_sign_out}>
                  {t("auth.sign_out")}
                </Button>
              </div>
            </div>
          </SettingsSection>

          {/* ---- Theme Section ---- */}
          <SettingsSection
            icon={<Palette className="h-5 w-5" />}
            title={t("settings.appearance", { defaultValue: "Appearance" })}
          >
            <div className="flex flex-wrap gap-3">
              {THEMES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => set_theme(value)}
                  className={[
                    "flex items-center gap-2 rounded-base border px-4 py-3 cursor-pointer",
                    "transition-all duration-[150ms]",
                    theme === value
                      ? "border-accent-main bg-accent-main/5 text-accent-main"
                      : "border-border-subtle text-text-secondary hover:border-text-secondary hover:text-text-primary",
                  ].join(" ")}
                  aria-pressed={theme === value}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-ui-base font-medium">{label}</span>
                  {theme === value && <Check className="h-4 w-4 ml-1" />}
                </button>
              ))}
            </div>
          </SettingsSection>

          {/* ---- Language Section ---- */}
          <SettingsSection
            icon={<Globe className="h-5 w-5" />}
            title={t("settings.language", { defaultValue: "Language" })}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {LANGUAGES.map(({ code, label, flag }) => (
                <button
                  key={code}
                  onClick={() => handle_language_change(code)}
                  className={[
                    "flex items-center gap-3 rounded-base border px-4 py-3 cursor-pointer",
                    "transition-all duration-[150ms]",
                    current_language === code
                      ? "border-accent-main bg-accent-main/5 text-accent-main"
                      : "border-border-subtle text-text-secondary hover:border-text-secondary hover:text-text-primary",
                  ].join(" ")}
                  aria-pressed={current_language === code}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-surface border border-border-subtle text-ui-sm font-semibold">
                    {flag}
                  </span>
                  <span className="text-ui-base font-medium">{label}</span>
                  {current_language === code && (
                    <Check className="h-4 w-4 ml-auto" />
                  )}
                </button>
              ))}
            </div>
          </SettingsSection>

          {/* ---- About Section ---- */}
          <SettingsSection
            icon={<span className="text-accent-caret font-bold text-ui-lg">^</span>}
            title={t("settings.about", { defaultValue: "About Caret" })}
          >
            <div className="space-y-2">
              <p className="text-ui-base text-text-secondary">
                {t("settings.about_description", {
                  defaultValue: "Caret is an AI-first document editor for collaborative and structured writing.",
                })}
              </p>
              <p className="text-ui-sm text-text-secondary">
                Version 0.1.0 (Alpha)
              </p>
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SettingsSection — reusable section wrapper
   ============================================================ */

interface SettingsSectionProps {
  /** Icon displayed next to the section title. */
  icon: React.ReactNode;
  /** Section heading text. */
  title: string;
  /** Section content. */
  children: React.ReactNode;
}

/**
 * Wraps a settings section with consistent styling:
 * icon + title header and a bordered content area.
 */
function SettingsSection({ icon, title, children }: SettingsSectionProps) {
  return (
    <section className="rounded-md border border-border-subtle bg-surface shadow-subtle">
      {/* Section header */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-6 py-4">
        <span className="text-text-secondary">{icon}</span>
        <h2 className="font-ui text-ui-lg font-semibold text-text-primary">
          {title}
        </h2>
      </div>
      {/* Section content */}
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}
