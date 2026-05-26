/**
 * RemoteCursor component and related types.
 * Displays cursor positions of remote collaborators in the editor.
 *
 * This file provides the API structure and placeholder implementation
 * for remote cursor rendering. Full cursor decoration will be integrated
 * with the Tiptap CollaborationCursor extension.
 */

import { type ReactNode } from "react";
import type { AwarenessClient, CursorPosition } from "../types";

/**
 * Props for rendering a single remote cursor.
 */
export interface RemoteCursorProps {
  /** The collaborator whose cursor to render. */
  collaborator: AwarenessClient;
  /** Cursor position in the document. */
  position: CursorPosition;
  /** Whether the cursor is currently visible. */
  is_visible: boolean;
}

/**
 * Props for the RemoteCursors container component.
 */
export interface RemoteCursorsProps {
  /** Array of collaborators with cursor data. */
  collaborators: AwarenessClient[];
  /** Whether cursor rendering is enabled. */
  enabled?: boolean;
  /** Custom render function for cursor labels. */
  render_label?: (collaborator: AwarenessClient) => ReactNode;
}

/**
 * Configuration for cursor appearance.
 */
export interface CursorConfig {
  /** Show user name label above cursor. */
  show_label: boolean;
  /** Milliseconds to show label after cursor moves, then fade. */
  label_timeout_ms: number;
  /** Cursor line width in pixels. */
  cursor_width: number;
  /** Whether to show selection highlights. */
  show_selection: boolean;
  /** Opacity of selection highlight (0-1). */
  selection_opacity: number;
}

/**
 * Default cursor configuration.
 */
export const DEFAULT_CURSOR_CONFIG: CursorConfig = {
  show_label: true,
  label_timeout_ms: 3000,
  cursor_width: 2,
  show_selection: true,
  selection_opacity: 0.3,
};

/**
 * Generates CSS styles for a collaborator's cursor.
 *
 * @param color - The collaborator's assigned color.
 * @param config - Cursor configuration.
 * @returns CSS custom properties for cursor styling.
 */
export function get_cursor_styles(
  color: string,
  config: CursorConfig = DEFAULT_CURSOR_CONFIG,
): Record<string, string> {
  return {
    "--cursor-color": color,
    "--cursor-width": `${config.cursor_width}px`,
    "--selection-color": color,
    "--selection-opacity": `${config.selection_opacity}`,
  };
}

/**
 * Filters collaborators to only those with valid cursor positions.
 *
 * @param collaborators - Array of awareness clients.
 * @returns Array of clients that have cursor data.
 */
export function get_collaborators_with_cursors(
  collaborators: AwarenessClient[],
): AwarenessClient[] {
  return collaborators.filter(
    (client) =>
      client.user.cursor !== undefined &&
      client.user.cursor.anchor !== undefined &&
      client.user.cursor.head !== undefined,
  );
}

/**
 * Creates the cursor label element configuration for Tiptap CollaborationCursor.
 *
 * This function is designed to be passed to the Tiptap CollaborationCursor
 * extension's `render` option for custom cursor label rendering.
 *
 * @param user - User data from awareness state.
 * @returns DOM element for the cursor label.
 *
 * @example
 * ```tsx
 * // In Tiptap editor configuration:
 * CollaborationCursor.configure({
 *   provider,
 *   user: local_user,
 *   render: create_cursor_label,
 * })
 * ```
 */
export function create_cursor_label(user: { name: string; color: string }): HTMLElement {
  const cursor = document.createElement("span");
  cursor.className = [
    "relative inline-block h-[1.35em] w-0 border-l-2 align-text-bottom",
    "pointer-events-none z-[20]",
  ].join(" ");
  cursor.style.borderColor = user.color;

  const label = document.createElement("span");
  label.className = [
    "absolute -top-5 left-0",
    "px-1.5 py-0.5",
    "rounded text-[10px] font-ui font-medium leading-none",
    "text-white whitespace-nowrap",
    "pointer-events-none",
    "z-[20]", // z-collab-cursors from FRONTEND.md
  ].join(" ");
  label.style.backgroundColor = user.color;
  label.textContent = user.name;

  cursor.appendChild(label);
  return cursor;
}

/**
 * CSS animation keyframes for cursor label fade-in.
 * Add this to your global styles if not already present.
 *
 * ```css
 * @keyframes fade-in {
 *   from { opacity: 0; transform: translateY(4px); }
 *   to { opacity: 1; transform: translateY(0); }
 * }
 *
 * .animate-fade-in {
 *   animation: fade-in 150ms ease-out forwards;
 * }
 * ```
 */
export const CURSOR_ANIMATION_CSS = `
@keyframes cursor-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-cursor-fade-in {
  animation: cursor-fade-in 150ms ease-out forwards;
}
`;
