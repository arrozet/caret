import { create } from "zustand";

/** Shape of the AI panel store managed by Zustand. */
interface AiState {
  /** Whether the AI chat panel is currently visible. */
  is_panel_open: boolean;
  /** The conversation ID currently shown in the panel (null = no active conversation). */
  active_conversation_id: string | null;

  /** Toggle panel open/closed. */
  toggle_panel: () => void;
  /** Open the AI panel. */
  open_panel: () => void;
  /** Close the AI panel. */
  close_panel: () => void;
  /** Set the active conversation being displayed. */
  set_conversation: (id: string | null) => void;
}

/**
 * Global AI assistant store.
 *
 * Manages AI panel visibility and the active conversation context.
 * Toggled via Ctrl/Cmd+K keyboard shortcut registered in EditorPage.
 *
 * State management strategy (FRONTEND.md §21):
 *   Global UI state -> Zustand
 */
export const use_ai_store = create<AiState>((set) => ({
  is_panel_open: true,
  active_conversation_id: null,

  toggle_panel() {
    set((state) => ({ is_panel_open: !state.is_panel_open }));
  },

  open_panel() {
    set({ is_panel_open: true });
  },

  close_panel() {
    set({ is_panel_open: false });
  },

  set_conversation(id: string | null) {
    set({ active_conversation_id: id });
  },
}));
