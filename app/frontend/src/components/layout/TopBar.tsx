import { useTranslation } from "react-i18next";
import { use_auth_store } from "../../stores/auth_store";
import { use_theme } from "../../hooks/use_theme";
import { Button } from "../ui/Button";
import { LogOut, Sun, Moon, Monitor } from "lucide-react";

/** Map theme value to its corresponding icon component. */
const theme_icons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

/**
 * Top navigation bar — fixed at the top of the viewport.
 *
 * Displays the app logo/name, and user actions (theme toggle, sign out).
 * Height: 56px (space-14 token, see FRONTEND.md §3).
 * Z-index: z-30 (Chrome layer, see FRONTEND.md §4).
 */
export function TopBar() {
  const { t } = useTranslation("common");
  const user = use_auth_store((s) => s.user);
  const sign_out = use_auth_store((s) => s.sign_out);
  const { theme, toggle_theme } = use_theme();

  const ThemeIcon = theme_icons[theme];

  return (
    <header className="ui-peripheral fixed top-0 right-0 left-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-surface px-6">
      {/* Left: Logo / App name */}
      <div className="flex items-center gap-3">
        <h1 className="font-ui text-ui-lg font-semibold tracking-tight text-text-primary">
          {t("app_name")}
        </h1>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle_theme}
          aria-label={t(`theme.${theme}`)}
        >
          <ThemeIcon className="h-4 w-4" />
        </Button>

        {/* User info + sign out */}
        {user && (
          <>
            <span className="text-ui-sm text-text-secondary">
              {user.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={sign_out}
              aria-label={t("auth.sign_out")}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
