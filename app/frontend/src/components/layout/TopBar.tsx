import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
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
 * Displays the app logo/name, breadcrumb context (e.g. document title),
 * and user actions (theme toggle, sign out).
 * Height: 56px (space-14 token, see FRONTEND.md §3).
 * Z-index: z-30 (Chrome layer, see FRONTEND.md §4).
 */
export function TopBar() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();
  const user = use_auth_store((s) => s.user);
  const sign_out = use_auth_store((s) => s.sign_out);
  const { theme, toggle_theme } = use_theme();

  const ThemeIcon = theme_icons[theme];

  /** Whether we're on a document editing page. */
  const is_editor_page = location.pathname.startsWith("/documents/");

  return (
    <header className="ui-peripheral fixed top-0 right-0 left-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-surface px-4 md:px-6">
      {/* Left: Logo + breadcrumb context */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => navigate("/documents")}
          className="shrink-0 cursor-pointer font-ui text-ui-lg font-semibold tracking-tight text-text-primary hover:text-accent-main transition-colors"
        >
          {t("app_name")}
        </button>

        {/* Breadcrumb separator + context for editor pages */}
        {is_editor_page && (
          <>
            <span className="text-text-secondary select-none">/</span>
            <span className="truncate text-ui-base text-text-secondary">
              Editing
            </span>
          </>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        {/* Collab avatars placeholder — future Phase 3 */}
        {is_editor_page && (
          <div className="hidden md:flex items-center gap-1 mr-2" aria-label="Collaborators">
            {/* Avatars will render here in Phase 3 */}
          </div>
        )}

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
            <span className="hidden md:inline text-ui-sm text-text-secondary truncate max-w-[160px]">
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
