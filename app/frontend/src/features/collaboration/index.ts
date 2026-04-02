/**
 * Collaboration feature public API.
 * Exports multiplayer components and hooks for integration with the editor.
 */

// Types
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

// Hooks
export { useAwareness } from "./hooks";

// Components
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
