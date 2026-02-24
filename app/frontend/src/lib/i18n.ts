import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import en_common from "../locales/en-US/common.json";
import en_editor from "../locales/en-US/editor.json";
import en_ai from "../locales/en-US/ai.json";
import en_errors from "../locales/en-US/errors.json";
import es_common from "../locales/es/common.json";
import fr_common from "../locales/fr/common.json";
import de_common from "../locales/de/common.json";
import pt_common from "../locales/pt/common.json";

/** Key used to persist the user's language preference in localStorage. */
const LANGUAGE_STORAGE_KEY = "caret-language";

/**
 * Detect the initial language from localStorage or browser locale.
 * Falls back to "en-US" if no preference is found or the locale is unsupported.
 */
function detect_language(): string {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored) {
    return stored;
  }

  const browser_locale = navigator.language;

  /* Match exact locale (e.g. "en-US") or language prefix (e.g. "es") */
  const supported: Record<string, string> = {
    "en-US": "en-US",
    en: "en-US",
    es: "es",
    fr: "fr",
    de: "de",
    pt: "pt",
  };

  return supported[browser_locale] ?? supported[browser_locale.split("-")[0]] ?? "en-US";
}

/**
 * Initialize react-i18next with all available translations.
 * Call this once at application startup (in main.tsx).
 *
 * Configuration follows FRONTEND.md §8:
 * - Primary: en-US, additional: es, fr, de, pt
 * - Fallback to English when a key is missing
 * - Language stored in localStorage under "caret-language"
 * - Auto-detects browser locale on first visit
 */
const i18n = i18next.createInstance();

i18n.use(initReactI18next).init({
  resources: {
    "en-US": {
      common: en_common,
      editor: en_editor,
      ai: en_ai,
      errors: en_errors,
    },
    es: { common: es_common },
    fr: { common: fr_common },
    de: { common: de_common },
    pt: { common: pt_common },
  },
  lng: detect_language(),
  fallbackLng: "en-US",
  defaultNS: "common",
  ns: ["common", "editor", "ai", "errors"],
  interpolation: {
    /* React already escapes values — no need for i18next to double-escape */
    escapeValue: false,
  },
});

/**
 * Persist the chosen language to localStorage whenever it changes.
 */
i18n.on("languageChanged", (lng: string) => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
});

export default i18n;
