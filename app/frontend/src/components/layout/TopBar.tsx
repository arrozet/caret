import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { useDocument } from "../../features/editor/hooks/useDocument";
import { Button } from "../ui/Button";
import { CaretLogo } from "../ui/Logo";
import { LogOut, Sun, Moon, Monitor, Settings } from "lucide-react";

/** Map theme value to its corresponding icon component. */
const theme_icons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

/**
 * Top navigation bar — fixed at the top of the viewport.
 *
 * Displays the app logo/name, breadcrumb context (document title when
 * editing), and user actions (settings, theme toggle, sign out).
 * Height: 56px (space-14 token, see FRONTEND.md §3).
 * Z-index: z-30 (Chrome layer, see FRONTEND.md §4).
 */
export function TopBar() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const { theme, toggleTheme } = useTheme();

  const ThemeIcon = theme_icons[theme];

  /** Whether we're on a document editing page. */
  const isEditorPage = location.pathname.startsWith("/documents/");

  /** Fetch document title for breadcrumb when on editor page. */
  const { data: document } = useDocument(isEditorPage ? params.id : undefined);

  /** Display title: use document title or fallback to "Untitled". */
  const displayTitle = document?.title || "Untitled";

  return (
    <header className="ui-peripheral fixed top-0 right-0 left-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-surface px-4 md:px-6">
      {/* Left: Logo + breadcrumb context */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => navigate("/documents")}
          className="shrink-0 cursor-pointer transition-opacity hover:opacity-80"
          aria-label="Go to documents"
        >
          <CaretLogo />
        </button>

        {/* Breadcrumb separator + document title for editor pages */}
        {isEditorPage && (
          <>
            <span className="text-text-secondary select-none">/</span>
            <span className="truncate text-ui-base text-text-secondary max-w-[200px] md:max-w-[300px]">
              {displayTitle}
            </span>
          </>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        {/* Collab avatars placeholder — future Phase 3 */}
        {isEditorPage && (
          <div className="hidden md:flex items-center gap-1 mr-2" aria-label="Collaborators">
            {/* Avatars will render here in Phase 3 */}
          </div>
        )}

        {/* Settings */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/settings")}
          aria-label={t("settings.title", { defaultValue: "Settings" })}
        >
          <Settings className="h-4 w-4" />
        </Button>

        {/* Theme toggle */}
        <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label={t(`theme.${theme}`)}>
          <ThemeIcon className="h-4 w-4" />
        </Button>

        {/* User info + sign out */}
        {user && (
          <>
            <span className="hidden md:inline text-ui-sm text-text-secondary truncate max-w-[160px]">
              {user.email}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut} aria-label={t("auth.sign_out")}>
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
