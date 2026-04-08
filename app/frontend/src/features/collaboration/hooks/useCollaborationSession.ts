import { useEffect, useMemo, useState } from "react";
import type { WebsocketProvider } from "y-websocket";
import type * as Y from "yjs";
import {
  createCollaborationSession,
  deriveUserColor,
  destroyCollaborationSession,
  extractPresenceUsers,
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
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [connection_status, setConnectionStatus] =
    useState<CollaborationConnectionStatus>("disconnected");
  const [users, setUsers] = useState<CollaborationPresenceUser[]>([]);

  useEffect(() => {
    if (!enabled || !document_id || !token || !user_id || !user_name) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional cleanup when deps are invalid
      setYdoc(null);
      setProvider(null);
      setConnectionStatus("disconnected");
      setUsers([]);
      return;
    }

    const session = createCollaborationSession({
      document_id,
      token,
      server_url,
    });

    setYdoc(session.ydoc);
    setProvider(session.provider);
    setConnectionStatus("connecting");

    const local_color = deriveUserColor(user_id);
    session.provider.awareness.setLocalStateField("user", {
      id: user_id,
      name: user_name,
      color: local_color,
    });

    const handle_status = ({ status }: { status: CollaborationConnectionStatus }) => {
      setConnectionStatus(status);
    };

    const handle_awareness_change = () => {
      setUsers(extractPresenceUsers(session.provider));
    };

    session.provider.on("status", handle_status);
    session.provider.awareness.on("change", handle_awareness_change);
    handle_awareness_change();
    session.provider.connect();

    return () => {
      session.provider.off("status", handle_status);
      session.provider.awareness.off("change", handle_awareness_change);
      setConnectionStatus("disconnected");
      setUsers([]);
      setProvider(null);
      setYdoc(null);
      destroyCollaborationSession(session);
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
