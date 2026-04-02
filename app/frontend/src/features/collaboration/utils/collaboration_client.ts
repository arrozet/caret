import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

/** Local collaboration service endpoint contract for development. */
export const LOCAL_COLLAB_WS_BASE_URL = "ws://localhost:3003/document";

/** Production collaboration service endpoint contract. */
export const PRODUCTION_COLLAB_WS_BASE_URL = "wss://collab.caret.page/document";

/** Provider connection states exposed to hooks/UI. */
export type CollaborationConnectionStatus = "connecting" | "connected" | "disconnected";

/** Local collaborator metadata propagated through awareness. */
export interface CollaborationLocalUser {
  id: string;
  name: string;
  color?: string;
}

/** Presence user model consumed by UI components. */
export interface CollaborationPresenceUser {
  id: string;
  name: string;
  color: string;
}

/** Runtime collaboration session primitives. */
export interface CollaborationSession {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
}

/** Required inputs to open a collaboration session. */
export interface CreateCollaborationSessionParams {
  document_id: string;
  token: string;
  server_url?: string;
}

/**
 * Build the websocket server URL from configured base and document id.
 */
export function build_collaboration_server_url(
  document_id: string,
  base_url: string = LOCAL_COLLAB_WS_BASE_URL,
): string {
  const normalized_base = base_url.endsWith("/") ? base_url.slice(0, -1) : base_url;
  return `${normalized_base}/${document_id}`;
}

/**
 * Create an isolated Y.Doc + WebsocketProvider session for one document room.
 */
export function create_collaboration_session({
  document_id,
  token,
  server_url = LOCAL_COLLAB_WS_BASE_URL,
}: CreateCollaborationSessionParams): CollaborationSession {
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(server_url, document_id, ydoc, {
    connect: false,
    params: {
      token,
    },
  });

  return {
    ydoc,
    provider,
  };
}

/**
 * Destroy provider and Y.Doc resources in a deterministic order.
 */
export function destroy_collaboration_session(session: CollaborationSession): void {
  session.provider.disconnect();
  session.provider.destroy();
  session.ydoc.destroy();
}

/**
 * Derive a stable display color from a user identifier.
 */
export function derive_user_color(user_id: string): string {
  const palette = [
    "#0066CC",
    "#D97706",
    "#0F766E",
    "#B91C1C",
    "#7C3AED",
    "#2563EB",
    "#0E7490",
    "#4D7C0F",
  ];

  let hash = 0;
  for (let idx = 0; idx < user_id.length; idx += 1) {
    hash = (hash << 5) - hash + user_id.charCodeAt(idx);
    hash |= 0;
  }

  const index = Math.abs(hash) % palette.length;
  return palette[index];
}

/**
 * Read current awareness states and map them into UI-friendly user entries.
 */
export function extract_presence_users(provider: WebsocketProvider): CollaborationPresenceUser[] {
  const users = new Map<string, CollaborationPresenceUser>();

  provider.awareness.getStates().forEach((state) => {
    const raw_user = (state as { user?: unknown }).user;
    if (!raw_user || typeof raw_user !== "object") {
      return;
    }

    const user = raw_user as {
      id?: unknown;
      name?: unknown;
      color?: unknown;
    };

    if (typeof user.id !== "string" || user.id.length === 0) {
      return;
    }

    const safe_name =
      typeof user.name === "string" && user.name.trim().length > 0 ? user.name.trim() : "User";

    const safe_color =
      typeof user.color === "string" && user.color.trim().length > 0
        ? user.color.trim()
        : derive_user_color(user.id);

    users.set(user.id, {
      id: user.id,
      name: safe_name,
      color: safe_color,
    });
  });

  return Array.from(users.values());
}
