/**
 * Collaboration feature hooks.
 * Application layer: manages Y.js provider lifecycle and awareness state.
 * Examples: useCollaboration, usePresence, useYjsDoc.
 */

// Session management hooks
export { use_collaboration_session } from "./use_collaboration_session";
export { use_collaboration_presence } from "./use_collaboration_presence";

export type {
  UseCollaborationSessionParams,
  UseCollaborationSessionResult,
} from "./use_collaboration_session";

// Awareness hook
export { useAwareness } from "./use_awareness";
