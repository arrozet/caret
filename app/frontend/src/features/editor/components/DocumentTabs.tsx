import { useNavigate, useParams } from "react-router-dom";
import { X, Plus, FileText } from "lucide-react";
import { use_tabs_store } from "../../../stores/tabs_store";

/**
 * Horizontal document tab strip rendered at the top of the editor layout.
 *
 * - Displays one tab per open document from the `tabs_store`.
 * - The tab matching the current URL param `:id` is visually active.
 * - Each tab has a close button (×) that removes it from the store.
 * - A "+" button navigates to `/documents` so the user can open another doc.
 * - Carries the `ui-peripheral` class so it fades in focus mode.
 *
 * Z-index: 30 (chrome layer, per FRONTEND.md §Z-Index Layers).
 */
export function DocumentTabs() {
  const { id: active_id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { open_tabs, close_tab } = use_tabs_store();

  /**
   * Navigate to a tab's document, unless it is already active.
   */
  function handle_tab_click(id: string) {
    if (id !== active_id) {
      navigate(`/documents/${id}`);
    }
  }

  /**
   * Close a tab.
   * If the closed tab is the active one, redirect to the nearest remaining
   * tab or, if none remain, back to the document list.
   */
  function handle_close(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const tab_index = open_tabs.findIndex((t) => t.id === id);
    close_tab(id);

    if (id === active_id) {
      const remaining = open_tabs.filter((t) => t.id !== id);
      if (remaining.length === 0) {
        navigate("/documents");
      } else {
        // Navigate to the previous tab, or the first if we closed index 0.
        const next_index = Math.max(0, tab_index - 1);
        navigate(`/documents/${remaining[next_index].id}`);
      }
    }
  }

  /**
   * Navigate to the document list to open a new document.
   */
  function handle_new_tab() {
    navigate("/documents");
  }

  if (open_tabs.length === 0) {
    return null;
  }

  return (
    <div
      className="ui-peripheral flex h-9 shrink-0 items-end overflow-x-auto border-b border-border-subtle bg-surface z-30"
      role="tablist"
      aria-label="Open documents"
    >
      {open_tabs.map((tab) => {
        const is_active = tab.id === active_id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={is_active}
            aria-label={`${tab.title} document tab`}
            onClick={() => handle_tab_click(tab.id)}
            className={[
              "group relative flex h-full min-w-0 max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-border-subtle px-3 text-left transition-colors",
              is_active
                ? "bg-bg-app text-text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-accent-main after:content-['']"
                : "bg-surface text-text-secondary hover:bg-bg-app hover:text-text-primary",
            ].join(" ")}
          >
            <FileText
              className="h-3.5 w-3.5 shrink-0 opacity-60"
              aria-hidden="true"
            />
            <span className="truncate text-ui-sm leading-none">{tab.title || "Untitled"}</span>
            <button
              onClick={(e) => handle_close(e, tab.id)}
              className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-border-subtle group-hover:opacity-100 focus:opacity-100"
              aria-label={`Close ${tab.title} tab`}
              tabIndex={-1}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </button>
        );
      })}

      {/* New tab / open document button */}
      <button
        onClick={handle_new_tab}
        className="flex h-full w-9 shrink-0 items-center justify-center text-text-secondary transition-colors hover:bg-bg-app hover:text-text-primary"
        aria-label="Open another document"
        title="Open document"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
