import { create } from "zustand";

/** Shape of the AI panel store managed by Zustand. */
interface AiState {
  /** Whether the AI chat panel is currently visible. */
  is_panel_open: boolean;
  /** The conversation ID currently shown in the panel (null = no active conversation). */
  active_conversation_id: string | null;
  /** Current AI panel mode: "ask" for plain chat, "agent" for agentic document editing. */
  ai_mode: "ask" | "agent";
  /** Currently selected agent type (only relevant when ai_mode === "agent"). */
  selected_agent_type: string;
  /** Selected LLM model ID, shared across chat panel and ghost text. */
  selected_model_id: string | undefined;

  /** Toggle panel open/closed. */
  toggle_panel: () => void;
  /** Open the AI panel. */
  open_panel: () => void;
  /** Close the AI panel. */
  close_panel: () => void;
  /** Set the active conversation being displayed. */
  set_conversation: (id: string | null) => void;
  /** Set the AI panel interaction mode. */
  set_ai_mode: (mode: "ask" | "agent") => void;
  /** Set the currently selected agent type. */
  set_selected_agent_type: (agent_type: string) => void;
  /** Set the selected LLM model ID. */
  set_selected_model_id: (model_id: string | undefined) => void;
}

/**
 * Global AI assistant store.
 *
 * Manages AI panel visibility, the active conversation context, the
 * interaction mode (ask vs agent), and the selected model. These fields
 * are shared between the ChatPanel and the ghost-text hook so that model
 * selection is consistent across both surfaces.
 *
 * State management strategy (FRONTEND.md §21):
 *   Global UI state -> Zustand
 */
export const use_ai_store = create<AiState>((set) => ({
  is_panel_open: true,
  active_conversation_id: null,
  ai_mode: "ask",
  selected_agent_type: "general",
  selected_model_id: undefined,

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

  set_ai_mode(mode: "ask" | "agent") {
    set({ ai_mode: mode });
  },

  set_selected_agent_type(agent_type: string) {
    set({ selected_agent_type: agent_type });
  },

  set_selected_model_id(model_id: string | undefined) {
    set({ selected_model_id: model_id });
  },
}));
