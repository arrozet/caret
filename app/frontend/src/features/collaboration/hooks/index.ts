/**
 * Collaboration feature hooks.
 * Application layer: manages Y.js provider lifecycle and awareness state.
 * Examples: useCollaboration, usePresence, useYjsDoc.
 */

// Session management hooks
export { useCollaborationSession } from "./useCollaborationSession";
export { useCollaborationPresence } from "./useCollaborationPresence";

export type {
  UseCollaborationSessionParams,
  UseCollaborationSessionResult,
} from "./useCollaborationSession";

// Awareness hook
export { useAwareness } from "./useAwareness";
