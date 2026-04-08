/**
 * Collaboration feature hooks.
 * Application layer: manages Y.js provider lifecycle and awareness state.
 * Examples: useCollaboration, usePresence, useYjsDoc.
 */

// Session management hooks
export { useCollaborationSession } from "./use_collaboration_session";
export { useCollaborationPresence } from "./use_collaboration_presence";

export type {
  UseCollaborationSessionParams,
  UseCollaborationSessionResult,
} from "./use_collaboration_session";

// Awareness hook
export { useAwareness } from "./use_awareness";
