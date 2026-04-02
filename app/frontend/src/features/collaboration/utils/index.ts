/**
 * Collaboration feature utilities.
 * Infrastructure layer: Y.js WebSocket provider setup, CRDT helpers.
 * Pure functions that set up and manage the Y.js document and provider.
 */
export {
  LOCAL_COLLAB_WS_BASE_URL,
  PRODUCTION_COLLAB_WS_BASE_URL,
  build_collaboration_server_url,
  create_collaboration_session,
  destroy_collaboration_session,
  derive_user_color,
  extract_presence_users,
} from "./collaboration_client";

export type {
  CollaborationConnectionStatus,
  CollaborationLocalUser,
  CollaborationPresenceUser,
  CollaborationSession,
  CreateCollaborationSessionParams,
} from "./collaboration_client";
