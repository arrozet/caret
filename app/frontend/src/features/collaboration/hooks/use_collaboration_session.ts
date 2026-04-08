import { useEffect, useMemo, useState } from "react";
import type { WebsocketProvider } from "y-websocket";
import type * as Y from "yjs";
import {
  create_collaboration_session,
  derive_user_color,
  destroy_collaboration_session,
  extract_presence_users,
  LOCAL_COLLAB_WS_BASE_URL,
  type CollaborationConnectionStatus,
  type CollaborationPresenceUser,
} from "../utils";

/** Hook inputs required to bootstrap collaboration for one document. */
export interface UseCollaborationSessionParams {
  document_id?: string;
  token?: string;
  user_id?: string;
  user_name?: string;
  enabled?: boolean;
  server_url?: string;
}

/** Hook outputs consumed by editor integration and lightweight UI. */
export interface UseCollaborationSessionResult {
  ydoc: Y.Doc | null;
  provider: WebsocketProvider | null;
  connection_status: CollaborationConnectionStatus;
  users: CollaborationPresenceUser[];
  is_ready: boolean;
}

/**
 * Create and manage collaboration session lifecycle for a single document room.
 */
export function useCollaborationSession({
  document_id,
  token,
  user_id,
  user_name,
  enabled = true,
  server_url = LOCAL_COLLAB_WS_BASE_URL,
}: UseCollaborationSessionParams): UseCollaborationSessionResult {
  const [ydoc, set_ydoc] = useState<Y.Doc | null>(null);
  const [provider, set_provider] = useState<WebsocketProvider | null>(null);
  const [connection_status, set_connection_status] =
    useState<CollaborationConnectionStatus>("disconnected");
  const [users, set_users] = useState<CollaborationPresenceUser[]>([]);

  useEffect(() => {
    if (!enabled || !document_id || !token || !user_id || !user_name) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional cleanup when deps are invalid
      set_ydoc(null);
      set_provider(null);
      set_connection_status("disconnected");
      set_users([]);
      return;
    }

    const session = create_collaboration_session({
      document_id,
      token,
      server_url,
    });

    set_ydoc(session.ydoc);
    set_provider(session.provider);
    set_connection_status("connecting");

    const local_color = derive_user_color(user_id);
    session.provider.awareness.setLocalStateField("user", {
      id: user_id,
      name: user_name,
      color: local_color,
    });

    const handle_status = ({ status }: { status: CollaborationConnectionStatus }) => {
      set_connection_status(status);
    };

    const handle_awareness_change = () => {
      set_users(extract_presence_users(session.provider));
    };

    session.provider.on("status", handle_status);
    session.provider.awareness.on("change", handle_awareness_change);
    handle_awareness_change();
    session.provider.connect();

    return () => {
      session.provider.off("status", handle_status);
      session.provider.awareness.off("change", handle_awareness_change);
      set_connection_status("disconnected");
      set_users([]);
      set_provider(null);
      set_ydoc(null);
      destroy_collaboration_session(session);
    };
  }, [enabled, document_id, token, user_id, user_name, server_url]);

  return useMemo(
    () => ({
      ydoc,
      provider,
      connection_status,
      users,
      is_ready: provider !== null && ydoc !== null,
    }),
    [ydoc, provider, connection_status, users],
  );
}
