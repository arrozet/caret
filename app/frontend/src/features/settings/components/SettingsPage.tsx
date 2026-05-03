import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { useEffect, useId, useRef, useState } from "react";
import {
  Globe,
  Palette,
  Sun,
  Moon,
  Monitor,
  Check,
  ChevronDown,
  LogOut,
  UserRound,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Avatar } from "../../../components/ui/Avatar";
import { useAuthStore } from "../../../stores/authStore";
import { useTheme } from "../../../hooks/useTheme";

/** Supported languages with display labels. */
const LANGUAGES = [
  { code: "en-US", label: "English", country: "us" },
  { code: "es", label: "Espanol", country: "es" },
  { code: "fr", label: "Francais", country: "fr" },
  { code: "de", label: "Deutsch", country: "de" },
  { code: "pt", label: "Portugues", country: "pt" },
] as const;

type LanguageCode = (typeof LANGUAGES)[number]["code"];

/** Theme options. */
const THEMES = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
] as const;

type ThemeValue = (typeof THEMES)[number]["value"];

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
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const { theme, setTheme } = useTheme();

  const currentLanguage = i18n.language;
  const current_language_option =
    LANGUAGES.find(({ code }) => code === currentLanguage) ??
    LANGUAGES.find(({ code }) => code === "en-US") ??
    LANGUAGES[0];
  const current_theme_option = THEMES.find(({ value }) => value === theme) ?? THEMES[0];
  const provider =
    typeof user?.app_metadata?.provider === "string" ? user.app_metadata.provider : "google";
  const provider_name = provider === "google" ? "Google" : provider;
  const display_name = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const [is_theme_menu_open, set_is_theme_menu_open] = useState(false);
  const [highlighted_theme_value, set_highlighted_theme_value] = useState<ThemeValue>(
    current_theme_option.value,
  );
  const theme_menu_id = useId();
  const theme_menu_ref = useRef<HTMLDivElement | null>(null);
  const theme_button_ref = useRef<HTMLButtonElement | null>(null);
  const [is_language_menu_open, set_is_language_menu_open] = useState(false);
  const [highlighted_language_code, set_highlighted_language_code] = useState<LanguageCode>(
    current_language_option.code,
  );
  const language_menu_id = useId();
  const language_menu_ref = useRef<HTMLDivElement | null>(null);
  const language_button_ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!theme_menu_ref.current?.contains(event.target as Node)) {
        set_is_theme_menu_open(false);
      }
      if (!language_menu_ref.current?.contains(event.target as Node)) {
        set_is_language_menu_open(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  /** Change the application language. */
  function handleThemeChange(nextTheme: ThemeValue) {
    setTheme(nextTheme);
    set_highlighted_theme_value(nextTheme);
    set_is_theme_menu_open(false);
    theme_button_ref.current?.focus();
  }

  function get_theme_index(themeValue: ThemeValue) {
    return THEMES.findIndex(({ value }) => value === themeValue);
  }

  function move_theme_highlight(step: 1 | -1) {
    const current_index = get_theme_index(highlighted_theme_value);
    const safe_index =
      current_index >= 0 ? current_index : get_theme_index(current_theme_option.value);
    const next_index = (safe_index + step + THEMES.length) % THEMES.length;
    set_highlighted_theme_value(THEMES[next_index].value);
  }

  function open_theme_menu(preferred_value?: ThemeValue) {
    set_highlighted_theme_value(preferred_value ?? current_theme_option.value);
    set_is_theme_menu_open(true);
  }

  function handle_theme_button_key_down(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      open_theme_menu(current_theme_option.value);
      move_theme_highlight(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      open_theme_menu(current_theme_option.value);
      move_theme_highlight(-1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      set_is_theme_menu_open((value) => !value);
    }
  }

  function handle_theme_menu_key_down(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      set_is_theme_menu_open(false);
      theme_button_ref.current?.focus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      move_theme_highlight(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      move_theme_highlight(-1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleThemeChange(highlighted_theme_value);
    }
  }

  function handleLanguageChange(languageCode: LanguageCode) {
    i18n.changeLanguage(languageCode);
    set_highlighted_language_code(languageCode);
    set_is_language_menu_open(false);
    language_button_ref.current?.focus();
  }

  function get_language_index(languageCode: LanguageCode) {
    return LANGUAGES.findIndex(({ code }) => code === languageCode);
  }

  function move_language_highlight(step: 1 | -1) {
    const current_index = get_language_index(highlighted_language_code);
    const safe_index =
      current_index >= 0 ? current_index : get_language_index(current_language_option.code);
    const next_index = (safe_index + step + LANGUAGES.length) % LANGUAGES.length;
    set_highlighted_language_code(LANGUAGES[next_index].code);
  }

  function open_language_menu(preferred_code?: LanguageCode) {
    set_highlighted_language_code(preferred_code ?? current_language_option.code);
    set_is_language_menu_open(true);
  }

  function handle_language_button_key_down(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      open_language_menu(current_language_option.code);
      move_language_highlight(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      open_language_menu(current_language_option.code);
      move_language_highlight(-1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      set_is_language_menu_open((value) => !value);
    }
  }

  function handle_language_menu_key_down(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      set_is_language_menu_open(false);
      language_button_ref.current?.focus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      move_language_highlight(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      move_language_highlight(-1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleLanguageChange(highlighted_language_code);
    }
  }

  /** Sign out and redirect. */
  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="flex flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto flex w-full max-w-[840px] flex-col gap-8">
        <header className="space-y-4 border-b border-border-subtle pb-6">
          <div className="space-y-2">
            <p className="text-ui-sm uppercase tracking-[0.18em] text-text-secondary/70">
              {t("settings.kicker", { defaultValue: "Workspace preferences" })}
            </p>
            <h1 className="font-document text-h2 font-normal tracking-[-0.02em] text-text-primary">
              {t("settings.title", { defaultValue: "Settings" })}
            </h1>
            <p className="max-w-[40rem] text-ui-base text-text-secondary">
              {t("settings.description", {
                defaultValue:
                  "Keep the writing surface quiet and move account, appearance, and session controls into one focused place.",
              })}
            </p>
          </div>
        </header>

        <section className="overflow-hidden rounded-lg border border-border-subtle bg-surface shadow-subtle">
          <SettingsSection
            icon={<UserRound className="h-4 w-4" />}
            title={t("settings.profile", { defaultValue: "Profile" })}
            description={t("settings.profile_description", {
              defaultValue:
                "Your editor identity stays lightweight in the chrome and lives here instead.",
            })}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar
                  name={display_name}
                  src={
                    typeof user?.user_metadata?.avatar_url === "string"
                      ? user.user_metadata.avatar_url
                      : undefined
                  }
                  size="lg"
                  className="border border-border-subtle bg-app"
                />

                <div className="space-y-1">
                  <p className="text-ui-lg font-medium text-text-primary">{display_name}</p>
                  <div className="inline-flex items-center gap-2 text-ui-sm text-text-secondary">
                    {provider === "google" ? (
                      <FontAwesomeIcon icon={faGoogle} className="text-[13px] text-accent-main" />
                    ) : null}
                    <span>
                      {t(`settings.provider_summary.${provider}`, {
                        defaultValue: `Logged in with ${provider_name}`,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            icon={<Palette className="h-4 w-4" />}
            title={t("settings.appearance", { defaultValue: "Appearance" })}
            description={t("settings.appearance_description", {
              defaultValue:
                "Choose how Caret should feel around the page while keeping the canvas itself calm.",
            })}
          >
            <div ref={theme_menu_ref} className="relative max-w-[18rem]">
              <button
                ref={theme_button_ref}
                type="button"
                onClick={() =>
                  is_theme_menu_open
                    ? set_is_theme_menu_open(false)
                    : open_theme_menu(current_theme_option.value)
                }
                onKeyDown={handle_theme_button_key_down}
                className="flex h-11 w-full items-center justify-between rounded-[4px] border border-border-subtle bg-app px-3 text-left text-ui-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-main/40"
                aria-haspopup="listbox"
                aria-expanded={is_theme_menu_open}
                aria-controls={theme_menu_id}
                aria-label={t("settings.appearance", { defaultValue: "Appearance" })}
              >
                <span className="inline-flex items-center gap-3">
                  <ThemeGlyph
                    icon={current_theme_option.icon}
                    testId={`theme-${current_theme_option.value}`}
                  />
                  <span>{current_theme_option.label}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-text-secondary" />
              </button>

              {is_theme_menu_open ? (
                <div
                  id={theme_menu_id}
                  role="listbox"
                  tabIndex={-1}
                  onKeyDown={handle_theme_menu_key_down}
                  className="absolute top-[calc(100%+8px)] right-0 left-0 z-40 overflow-hidden rounded-[4px] border border-border-subtle bg-surface shadow-elevated"
                >
                  {THEMES.map(({ value, label, icon }) => {
                    const is_selected = theme === value;
                    const is_highlighted = highlighted_theme_value === value;

                    return (
                      <button
                        key={value}
                        type="button"
                        role="option"
                        aria-selected={is_selected}
                        onMouseEnter={() => set_highlighted_theme_value(value)}
                        onClick={() => handleThemeChange(value)}
                        className={[
                          "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-ui-base transition",
                          is_highlighted ? "bg-app" : "bg-surface",
                          is_selected ? "text-accent-main" : "text-text-primary",
                        ].join(" ")}
                      >
                        <span className="inline-flex items-center gap-3">
                          <ThemeGlyph icon={icon} testId={`theme-${value}`} />
                          <span>{label}</span>
                        </span>
                        {is_selected ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </SettingsSection>

          <SettingsSection
            icon={<Globe className="h-4 w-4" />}
            title={t("settings.language", { defaultValue: "Language" })}
            description={t("settings.language_description", {
              defaultValue:
                "Set the interface language without changing the tone of your documents.",
            })}
          >
            <div ref={language_menu_ref} className="relative max-w-[18rem]">
              <button
                ref={language_button_ref}
                type="button"
                onClick={() =>
                  is_language_menu_open
                    ? set_is_language_menu_open(false)
                    : open_language_menu(current_language_option.code)
                }
                onKeyDown={handle_language_button_key_down}
                className="flex h-11 w-full items-center justify-between rounded-[4px] border border-border-subtle bg-app px-3 text-left text-ui-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-main/40"
                aria-haspopup="listbox"
                aria-expanded={is_language_menu_open}
                aria-controls={language_menu_id}
                aria-label={t("settings.language", { defaultValue: "Language" })}
              >
                <span className="inline-flex items-center gap-3">
                  <LanguageFlag
                    country={current_language_option.country}
                    testId={`flag-${current_language_option.country}`}
                  />
                  <span>{current_language_option.label}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-text-secondary" />
              </button>

              {is_language_menu_open ? (
                <div
                  id={language_menu_id}
                  role="listbox"
                  tabIndex={-1}
                  onKeyDown={handle_language_menu_key_down}
                  className="absolute top-[calc(100%+8px)] right-0 left-0 z-40 overflow-hidden rounded-[4px] border border-border-subtle bg-surface shadow-elevated"
                >
                  {LANGUAGES.map(({ code, label, country }) => {
                    const is_selected = currentLanguage === code;
                    const is_highlighted = highlighted_language_code === code;

                    return (
                      <button
                        key={code}
                        type="button"
                        role="option"
                        aria-selected={is_selected}
                        onMouseEnter={() => set_highlighted_language_code(code)}
                        onClick={() => handleLanguageChange(code)}
                        className={[
                          "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-ui-base transition",
                          is_highlighted ? "bg-app" : "bg-surface",
                          is_selected ? "text-accent-main" : "text-text-primary",
                        ].join(" ")}
                      >
                        <span className="inline-flex items-center gap-3">
                          <LanguageFlag country={country} testId={`flag-${country}`} />
                          <span>{label}</span>
                        </span>
                        {is_selected ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </SettingsSection>
        </section>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="md"
            onClick={handleSignOut}
            className="w-full border border-accent-caret/30 bg-accent-caret/8 text-accent-caret hover:bg-accent-caret/14 hover:text-accent-caret sm:w-auto"
          >
            <LogOut className="h-4 w-4" />
            <span>{t("auth.sign_out")}</span>
          </Button>
        </div>

        <section className="border-t border-border-subtle pt-4 text-ui-sm text-text-secondary">
          <p>
            {t("settings.about_description", {
              defaultValue:
                "Caret is an AI-first document editor for collaborative and structured writing.",
            })}
          </p>
          <p className="mt-2">Version 0.1.0 (Alpha)</p>
        </section>
      </div>
    </div>
  );
}

function LanguageFlag({
  country,
  testId,
}: {
  country: "us" | "es" | "fr" | "de" | "pt";
  testId?: string;
}) {
  switch (country) {
    case "us":
      return (
        <FlagFrame testId={testId}>
          <svg viewBox="0 0 36 24" className="h-full w-full">
            <rect width="36" height="24" fill="#b22234" />
            <rect y="2.77" width="36" height="1.85" fill="#fff" />
            <rect y="6.46" width="36" height="1.85" fill="#fff" />
            <rect y="10.15" width="36" height="1.85" fill="#fff" />
            <rect y="13.85" width="36" height="1.85" fill="#fff" />
            <rect y="17.54" width="36" height="1.85" fill="#fff" />
            <rect y="21.23" width="36" height="1.85" fill="#fff" />
            <rect width="15.4" height="12.92" fill="#3c3b6e" />
          </svg>
        </FlagFrame>
      );
    case "es":
      return (
        <FlagFrame testId={testId}>
          <svg viewBox="0 0 36 24" className="h-full w-full">
            <rect width="36" height="24" fill="#aa151b" />
            <rect y="6" width="36" height="12" fill="#f1bf00" />
          </svg>
        </FlagFrame>
      );
    case "fr":
      return (
        <FlagFrame testId={testId}>
          <svg viewBox="0 0 36 24" className="h-full w-full">
            <rect width="12" height="24" fill="#0055a4" />
            <rect x="12" width="12" height="24" fill="#fff" />
            <rect x="24" width="12" height="24" fill="#ef4135" />
          </svg>
        </FlagFrame>
      );
    case "de":
      return (
        <FlagFrame testId={testId}>
          <svg viewBox="0 0 36 24" className="h-full w-full">
            <rect width="36" height="8" fill="#000" />
            <rect y="8" width="36" height="8" fill="#dd0000" />
            <rect y="16" width="36" height="8" fill="#ffce00" />
          </svg>
        </FlagFrame>
      );
    case "pt":
      return (
        <FlagFrame testId={testId}>
          <svg viewBox="0 0 36 24" className="h-full w-full">
            <rect width="14" height="24" fill="#006600" />
            <rect x="14" width="22" height="24" fill="#ff0000" />
            <circle cx="14" cy="12" r="4" fill="#ffcc00" />
          </svg>
        </FlagFrame>
      );
  }
}

function FlagFrame({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex h-4 w-6 overflow-hidden rounded-[2px] border border-border-subtle/80"
    >
      {children}
    </span>
  );
}

function ThemeGlyph({ icon: Icon, testId }: { icon: typeof Sun; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex h-4 w-4 items-center justify-center text-current"
    >
      <Icon className="h-4 w-4" />
    </span>
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
  /** Short supporting copy under the heading. */
  description: string;
  /** Section content. */
  children: React.ReactNode;
}

/**
 * Wraps a settings section with consistent styling:
 * icon + title header and a bordered content area.
 */
function SettingsSection({ icon, title, description, children }: SettingsSectionProps) {
  return (
    <section className="border-b border-border-subtle last:border-b-0">
      <div className="grid gap-6 px-5 py-5 md:grid-cols-[minmax(0,1.65fr)_minmax(16rem,0.9fr)] md:px-6 md:py-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-text-secondary">
            <span>{icon}</span>
            <h2 className="font-ui text-ui-lg font-medium text-text-primary">{title}</h2>
          </div>
          <p className="max-w-[26rem] text-ui-sm text-text-secondary">{description}</p>
        </div>

        <div>{children}</div>
      </div>
    </section>
  );
}
