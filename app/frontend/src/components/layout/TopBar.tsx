import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { useDocument } from "../../features/editor/hooks/useDocument";
import { useWorkspaces } from "../../features/editor/hooks/useWorkspaces";
import { useFolders } from "../../features/editor/hooks/useFolders";
import { Button } from "../ui/Button";
import { CaretLogo } from "../ui/Logo";
import { LogOut, Sun, Moon, Monitor, Settings, LayoutGrid, Folder } from "lucide-react";
import type { FolderResponse } from "../../features/editor/api/documentApi";

/** Map theme value to its corresponding icon component. */
const theme_icons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

function build_folder_path(folders: FolderResponse[], folder_id: string | null) {
  const by_id = new Map(folders.map((f) => [f.id, f]));
  const path: FolderResponse[] = [];
  const visited = new Set<string>();
  let current = folder_id;
  while (current && !visited.has(current)) {
    const f = by_id.get(current);
    if (!f) break;
    path.unshift(f);
    visited.add(current);
    current = f.parent_folder_id;
  }
  return path;
}

/**
 * Top navigation bar — fixed at the top of the viewport.
 *
 * When on an editor page shows the full breadcrumb: workspace → folders → document title.
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

  const isEditorPage = location.pathname.startsWith("/documents/");
  const isDocumentsPage = location.pathname === "/documents";
  const documents_location_state = location.state as
    | { workspace_id?: string; folder_id?: string | null }
    | null
    | undefined;

  const { data: document } = useDocument(isEditorPage ? params.id : undefined);
  const { data: workspaces = [] } = useWorkspaces();
  const breadcrumb_workspace_id = isEditorPage
    ? (document?.workspace_id ?? null)
    : (documents_location_state?.workspace_id ?? null);
  const breadcrumb_folder_id = isEditorPage
    ? (document?.folder_id ?? null)
    : (documents_location_state?.folder_id ?? null);
  const { data: folders = [] } = useFolders(breadcrumb_workspace_id ?? undefined);

  const current_workspace = useMemo(
    () =>
      breadcrumb_workspace_id
        ? (workspaces.find((w) => w.id === breadcrumb_workspace_id) ?? null)
        : null,
    [workspaces, breadcrumb_workspace_id],
  );

  const current_folder_path = useMemo(
    () => build_folder_path(folders, breadcrumb_folder_id),
    [folders, breadcrumb_folder_id],
  );

  function navigate_to_documents_location(workspace_id: string, folder_id: string | null) {
    navigate("/documents", {
      state: {
        workspace_id,
        folder_id,
      },
    });
  }

  return (
    <header className="ui-peripheral fixed top-0 right-0 left-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-surface px-4 md:px-6">
      {/* Left: Logo + breadcrumb */}
      <div className="flex min-w-0 items-center gap-2 overflow-hidden text-ui-sm text-text-secondary">
        <button
          onClick={() =>
            navigate("/documents", {
              state: { workspace_id: null, folder_id: null },
            })
          }
          className="shrink-0 cursor-pointer transition-opacity hover:opacity-80"
          aria-label="Go to documents"
        >
          <CaretLogo />
        </button>

        {(isEditorPage || isDocumentsPage) && current_workspace ? (
          <>
            <span aria-hidden="true" className="shrink-0 text-text-secondary/40">
              /
            </span>
            <button
              type="button"
              onClick={() => navigate_to_documents_location(current_workspace.id, null)}
              className="inline-flex shrink-0 items-center gap-1 rounded-[4px] px-1 py-0.5 text-text-primary transition hover:bg-app"
              aria-label={`Open workspace ${current_workspace.name}`}
            >
              <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-[12rem] truncate">{current_workspace.name}</span>
            </button>

            {current_folder_path.map((folder) => (
              <span key={folder.id} className="inline-flex shrink-0 items-center gap-2">
                <span aria-hidden="true" className="text-text-secondary/40">
                  /
                </span>
                <button
                  type="button"
                  onClick={() => navigate_to_documents_location(current_workspace.id, folder.id)}
                  className="inline-flex items-center gap-1 rounded-[4px] px-1 py-0.5 text-text-primary transition hover:bg-app"
                  aria-label={`Open folder ${folder.name}`}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="max-w-[10rem] truncate">{folder.name}</span>
                </button>
              </span>
            ))}

            {isEditorPage ? (
              <>
                <span aria-hidden="true" className="shrink-0 text-text-secondary/40">
                  /
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/documents/${document?.id ?? ""}`)}
                  className="truncate rounded-[4px] px-1 py-0.5 font-medium text-text-primary transition hover:bg-app"
                  aria-label={`Open document ${document?.title || "Untitled"}`}
                  disabled={!document?.id}
                >
                  {document?.title || "Untitled"}
                </button>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Right: Actions */}
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
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
