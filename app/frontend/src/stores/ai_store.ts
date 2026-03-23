import { create } from "zustand";
import type { DocumentChangePayload } from "../features/ai-assistant/api/ai_api";

/** AI interaction mode: plain Q&A vs. agentic document editing. */
export type AiMode = "ask" | "agent";

/** Shape of the AI panel store managed by Zustand. */
interface AiState {
  /** Whether the AI chat panel is currently visible. */
  is_panel_open: boolean;
  /** The conversation ID currently shown in the panel (null = no active conversation). */
  active_conversation_id: string | null;
  /** Current AI interaction mode. */
  ai_mode: AiMode;
  /** Agent type slug sent to the backend when ai_mode === "agent". */
  selected_agent_type: string;
  /** Currently selected LLM model ID (undefined = server default). */
  selected_model_id: string | undefined;
  /** Latest pending document change proposed by the agent. */
  pending_document_change: DocumentChangePayload | null;

  /** Toggle panel open/closed. */
  toggle_panel: () => void;
  /** Open the AI panel. */
  open_panel: () => void;
  /** Close the AI panel. */
  close_panel: () => void;
  /** Set the active conversation being displayed. */
  set_conversation: (id: string | null) => void;
  /** Switch between Ask and Agent modes. */
  set_ai_mode: (mode: AiMode) => void;
  /** Set the selected LLM model. */
  set_selected_model_id: (id: string | undefined) => void;
  /** Update (or clear) the globally pending document change. */
  set_pending_document_change: (change: DocumentChangePayload | null) => void;
}

/**
 * Global AI assistant store.
 *
 * Manages AI panel visibility, the active conversation context, interaction
 * mode (ask / agent), and model selection.
 *
 * State management strategy (FRONTEND.md §21): Global UI state → Zustand.
 */
export const use_ai_store = create<AiState>((set) => ({
  is_panel_open: true,
  active_conversation_id: null,
  ai_mode: "agent",
  selected_agent_type: "general",
  selected_model_id: undefined,
  pending_document_change: null,

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

  set_ai_mode(mode: AiMode) {
    set({ ai_mode: mode });
  },

  set_selected_model_id(id: string | undefined) {
    set({ selected_model_id: id });
  },

  set_pending_document_change(change: DocumentChangePayload | null) {
    set({ pending_document_change: change });
  },
}));
