import { create } from "zustand";
import type { DocumentChangePayload } from "../features/ai-assistant/api/aiApi";

/** AI interaction mode: plain Q&A vs. agentic document editing. */
export type AiMode = "ask" | "agent";

/** Shape of the AI panel store managed by Zustand. */
interface AiState {
  /** Whether the AI chat panel is currently visible. */
  isPanelOpen: boolean;
  /** Document currently being edited in the main pane. */
  activeDocumentId: string | null;
  /** The conversation ID currently shown in the panel (null = no active conversation). */
  activeConversationId: string | null;
  /** Active conversation ID per document. */
  conversationByDocumentId: Record<string, string | null>;
  /** Current AI interaction mode. */
  aiMode: AiMode;
  /** Agent type slug sent to the backend when ai_mode === "agent". */
  selectedAgentType: string;
  /** Currently selected LLM model ID (undefined = server default). */
  selectedModelId: string | undefined;
  /** Latest pending document change proposed by the agent. */
  pendingDocumentChange: DocumentChangePayload | null;

  /** Toggle panel open/closed. */
  togglePanel: () => void;
  /** Open the AI panel. */
  openPanel: () => void;
  /** Close the AI panel. */
  closePanel: () => void;
  /** Set the active document and restore its conversation if one exists. */
  setActiveDocumentId: (documentId: string | null) => void;
  /** Set the active conversation being displayed. */
  setConversation: (id: string | null) => void;
  /** Set the active conversation for one document. */
  setConversationForDocument: (documentId: string, id: string | null) => void;
  /** Switch between Ask and Agent modes. */
  setAiMode: (mode: AiMode) => void;
  /** Set the selected LLM model. */
  setSelectedModelId: (id: string | undefined) => void;
  /** Update (or clear) the globally pending document change. */
  setPendingDocumentChange: (change: DocumentChangePayload | null) => void;
}

/**
 * Global AI assistant store.
 *
 * Manages AI panel visibility, the active conversation context, interaction
 * mode (ask / agent), and model selection.
 *
 * State management strategy (FRONTEND.md §21): Global UI state → Zustand.
 */
export const useAiStore = create<AiState>((set) => ({
  isPanelOpen: true,
  activeDocumentId: null,
  activeConversationId: null,
  conversationByDocumentId: {},
  aiMode: "agent",
  selectedAgentType: "general",
  selectedModelId: undefined,
  pendingDocumentChange: null,

  togglePanel() {
    set((state) => ({ isPanelOpen: !state.isPanelOpen }));
  },

  openPanel() {
    set({ isPanelOpen: true });
  },

  closePanel() {
    set({ isPanelOpen: false });
  },

  setActiveDocumentId(documentId: string | null) {
    set((state) => ({
      activeDocumentId: documentId,
      activeConversationId:
        documentId === null ? null : (state.conversationByDocumentId[documentId] ?? null),
    }));
  },

  setConversation(id: string | null) {
    set((state) => ({
      activeConversationId: id,
      ...(state.activeDocumentId
        ? {
            conversationByDocumentId: {
              ...state.conversationByDocumentId,
              [state.activeDocumentId]: id,
            },
          }
        : {}),
    }));
  },

  setConversationForDocument(documentId: string, id: string | null) {
    set((state) => ({
      conversationByDocumentId: {
        ...state.conversationByDocumentId,
        [documentId]: id,
      },
      activeConversationId: state.activeDocumentId === documentId ? id : state.activeConversationId,
    }));
  },

  setAiMode(mode: AiMode) {
    set({ aiMode: mode });
  },

  setSelectedModelId(id: string | undefined) {
    set({ selectedModelId: id });
  },

  setPendingDocumentChange(change: DocumentChangePayload | null) {
    set({ pendingDocumentChange: change });
  },
}));
