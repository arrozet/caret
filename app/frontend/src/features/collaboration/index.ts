/**
 * Collaboration feature public API.
 * Exports multiplayer components and hooks for integration with the editor.
 */
export { CollaborationPresenceBar } from "./components";
export { use_collaboration_presence, use_collaboration_session } from "./hooks";
export {
  LOCAL_COLLAB_WS_BASE_URL,
  PRODUCTION_COLLAB_WS_BASE_URL,
  build_collaboration_server_url,
  create_collaboration_session,
  destroy_collaboration_session,
  derive_user_color,
  extract_presence_users,
} from "./utils";

export type {
  CollaborationPresenceBarProps,
} from "./components";

export type {
  UseCollaborationSessionParams,
  UseCollaborationSessionResult,
} from "./hooks";

export type {
  CollaborationConnectionStatus,
  CollaborationLocalUser,
  CollaborationPresenceUser,
  CollaborationSession,
  CreateCollaborationSessionParams,
} from "./utils";
