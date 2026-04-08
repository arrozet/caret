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
  openTabs: Tab[];
  /** Open (or focus) a tab. If the tab already exists, it becomes active. */
  addTab: (tab: Tab) => void;
  /** Update the title of an existing tab (e.g. after a rename save). */
  updateTabTitle: (id: string, title: string) => void;
  /** Close a single tab by document ID. */
  closeTab: (id: string) => void;
  /** Close all open tabs. */
  closeAllTabs: () => void;
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
export const useTabsStore = create<TabsState>((set) => ({
  openTabs: [],

  addTab(tab: Tab) {
    set((state) => {
      const alreadyOpen = state.openTabs.some((t) => t.id === tab.id);
      if (alreadyOpen) {
        return state;
      }
      return { openTabs: [...state.openTabs, tab] };
    });
  },

  updateTabTitle(id: string, title: string) {
    set((state) => ({
      openTabs: state.openTabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  },

  closeTab(id: string) {
    set((state) => ({
      openTabs: state.openTabs.filter((t) => t.id !== id),
    }));
  },

  closeAllTabs() {
    set({ openTabs: [] });
  },
}));
