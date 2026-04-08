/**
 * Collaboration feature public API.
 * Exports multiplayer components and hooks for integration with the editor.
 */

// =============================================================================
// Types - Awareness Layer
// =============================================================================
export type {
  PresenceStatus,
  CursorPosition,
  AwarenessUserState,
  AwarenessClient,
  AwarenessState,
  AwarenessConfig,
} from "./types";

export {
  DEFAULT_AWARENESS_CONFIG,
  COLLABORATOR_COLORS,
  get_user_color,
  compute_presence_status,
} from "./types";

// =============================================================================
// Components
// =============================================================================
// Provider-based presence bar
export { CollaborationPresenceBar } from "./components";
export type { CollaborationPresenceBarProps } from "./components";

// Awareness UI components
export {
  CollaboratorsList,
  LivePresenceIndicator,
  create_cursor_label,
  get_cursor_styles,
  get_collaborators_with_cursors,
  DEFAULT_CURSOR_CONFIG,
  CURSOR_ANIMATION_CSS,
} from "./components";
export type { RemoteCursorProps, RemoteCursorsProps, CursorConfig } from "./components";

// Debug/testing components
export { CollabHarnessPage } from "./components";

// =============================================================================
// Hooks
// =============================================================================
// Session management
export { useCollaborationPresence, useCollaborationSession } from "./hooks";
export type { UseCollaborationSessionParams, UseCollaborationSessionResult } from "./hooks";

// Awareness hook
export { useAwareness } from "./hooks";

// =============================================================================
// Utils - Client Library
// =============================================================================
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
  CollaborationConnectionStatus,
  CollaborationLocalUser,
  CollaborationPresenceUser,
  CollaborationSession,
  CreateCollaborationSessionParams,
} from "./utils";

// Harness/debug utilities
export { build_collab_ws_endpoint, build_collab_provider_config } from "./utils";
