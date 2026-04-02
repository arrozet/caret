/**
 * Collaboration feature utilities.
 * Utility functions for building collaboration websocket connection settings.
 */

// Client library utilities
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

// Harness/debug utilities
export { build_collab_ws_endpoint, build_collab_provider_config } from "./build_collab_ws_endpoint";
