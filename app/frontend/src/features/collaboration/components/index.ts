/**
 * Collaboration feature components.
 * Presentation layer: UserAvatars, LiveCursor, PresenceIndicator.
 * Renders real-time user presence using Y.js awareness data.
 */

// Provider-based components
export { CollaborationPresenceBar } from "./CollaborationPresenceBar";
export type { CollaborationPresenceBarProps } from "./CollaborationPresenceBar";

// Awareness UI components
export { CollaboratorsList } from "./CollaboratorsList";
export { LivePresenceIndicator } from "./LivePresenceIndicator";
export {
  create_cursor_label,
  get_cursor_styles,
  get_collaborators_with_cursors,
  DEFAULT_CURSOR_CONFIG,
  CURSOR_ANIMATION_CSS,
  type RemoteCursorProps,
  type RemoteCursorsProps,
  type CursorConfig,
} from "./RemoteCursor";
