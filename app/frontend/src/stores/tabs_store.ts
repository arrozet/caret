import { create } from "zustand";

/**
 * Represents a single open document tab.
 */
export interface Tab {
  /** Document UUID. */
  id: string;
  /** Display title shown in the tab strip. */
  title: string;
}

/** Shape of the tabs store managed by Zustand. */
interface TabsState {
  /** Ordered list of currently open document tabs. */
  open_tabs: Tab[];
  /** Open (or focus) a tab. If the tab already exists, it becomes active. */
  add_tab: (tab: Tab) => void;
  /** Update the title of an existing tab (e.g. after a rename save). */
  update_tab_title: (id: string, title: string) => void;
  /** Close a single tab by document ID. */
  close_tab: (id: string) => void;
  /** Close all open tabs. */
  close_all_tabs: () => void;
}

/**
 * Global tabs store.
 *
 * Tracks which documents are open in the editor tab strip. Each entry
 * maps one document ID to a display title. The strip renders tabs in
 * insertion order; the currently-routed document is highlighted via the
 * URL param, not stored here (to avoid duplication with React Router state).
 *
 * State management strategy (FRONTEND.md §21):
 *   Global UI state -> Zustand
 */
export const use_tabs_store = create<TabsState>((set) => ({
  open_tabs: [],

  add_tab(tab: Tab) {
    set((state) => {
      const already_open = state.open_tabs.some((t) => t.id === tab.id);
      if (already_open) {
        return state;
      }
      return { open_tabs: [...state.open_tabs, tab] };
    });
  },

  update_tab_title(id: string, title: string) {
    set((state) => ({
      open_tabs: state.open_tabs.map((t) =>
        t.id === id ? { ...t, title } : t
      ),
    }));
  },

  close_tab(id: string) {
    set((state) => ({
      open_tabs: state.open_tabs.filter((t) => t.id !== id),
    }));
  },

  close_all_tabs() {
    set({ open_tabs: [] });
  },
}));
