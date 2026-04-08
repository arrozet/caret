/**
 * Collaboration feature utilities.
 * Utility functions for building collaboration websocket connection settings.
 */

// Client library utilities
export {
  LOCAL_COLLAB_WS_BASE_URL,
  PRODUCTION_COLLAB_WS_BASE_URL,
  buildCollaborationServerUrl,
  createCollaborationSession,
  destroyCollaborationSession,
  deriveUserColor,
  extractPresenceUsers,
} from "./collaborationClient";

export type {
  CollaborationConnectionStatus,
  CollaborationLocalUser,
  CollaborationPresenceUser,
  CollaborationSession,
  CreateCollaborationSessionParams,
} from "./collaborationClient";

// Harness/debug utilities
export { buildCollabWsEndpoint, buildCollabProviderConfig } from "./buildCollabWsEndpoint";
