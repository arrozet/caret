import { useNavigate, useParams } from "react-router-dom";
import { X, Plus, FileText } from "lucide-react";
import { useTabsStore } from "../../../stores/tabsStore";

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
  const { id: activeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openTabs, closeTab } = useTabsStore();

  /**
   * Navigate to a tab's document, unless it is already active.
   */
  function handleTabClick(id: string) {
    if (id !== activeId) {
      navigate(`/documents/${id}`);
    }
  }

  /**
   * Close a tab.
   * If the closed tab is the active one, redirect to the nearest remaining
   * tab or, if none remain, back to the document list.
   */
  function handleClose(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const tabIndex = openTabs.findIndex((t) => t.id === id);
    closeTab(id);

    if (id === activeId) {
      const remaining = openTabs.filter((t) => t.id !== id);
      if (remaining.length === 0) {
        navigate("/documents");
      } else {
        // Navigate to the previous tab, or the first if we closed index 0.
        const nextIndex = Math.max(0, tabIndex - 1);
        navigate(`/documents/${remaining[nextIndex].id}`);
      }
    }
  }

  /**
   * Navigate to the document list to open a new document.
   */
  function handleNewTab() {
    navigate("/documents");
  }

  if (openTabs.length === 0) {
    return null;
  }

  return (
    <div
      className="ui-peripheral flex h-9 shrink-0 items-end overflow-x-auto border-b border-border-subtle bg-surface z-30"
      role="tablist"
      aria-label="Open documents"
    >
      {openTabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          // Use <div role="tab"> instead of <button> because the close button
          // lives inside each tab — HTML disallows <button> inside <button>.
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
            aria-label={`${tab.title} document tab`}
            onClick={() => handleTabClick(tab.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleTabClick(tab.id);
              }
            }}
            className={[
              "group relative flex h-full min-w-0 max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-border-subtle px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-main",
              isActive
                ? "bg-bg-app text-text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-accent-main after:content-['']"
                : "bg-surface text-text-secondary hover:bg-bg-app hover:text-text-primary",
            ].join(" ")}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
            <span className="truncate text-ui-sm leading-none">{tab.title || "Untitled"}</span>
            <button
              onClick={(e) => handleClose(e, tab.id)}
              className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-border-subtle group-hover:opacity-100 focus:opacity-100"
              aria-label={`Close ${tab.title} tab`}
              tabIndex={0}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        );
      })}

      {/* New tab / open document button */}
      <button
        onClick={handleNewTab}
        className="flex h-full w-9 shrink-0 items-center justify-center text-text-secondary transition-colors hover:bg-bg-app hover:text-text-primary"
        aria-label="Open another document"
        title="Open document"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
