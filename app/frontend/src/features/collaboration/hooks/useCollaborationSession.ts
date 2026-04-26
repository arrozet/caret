import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";
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
import {
  bootstrap_collaboration_document,
  has_bootstrap_content,
  is_collaboration_document_empty,
} from "../../editor/utils";

/** Hook inputs required to bootstrap collaboration for one document. */
export interface UseCollaborationSessionParams {
  document_id?: string;
  token?: string;
  user_id?: string;
  user_name?: string;
  enabled?: boolean;
  server_url?: string;
  initial_content?: JSONContent | null;
}

/** Hook outputs consumed by editor integration and lightweight UI. */
export interface UseCollaborationSessionResult {
  ydoc: Y.Doc | null;
  provider: WebsocketProvider | null;
  connection_status: CollaborationConnectionStatus;
  users: CollaborationPresenceUser[];
  is_synced: boolean;
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
  initial_content = null,
}: UseCollaborationSessionParams): UseCollaborationSessionResult {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [connection_status, setConnectionStatus] =
    useState<CollaborationConnectionStatus>("disconnected");
  const [users, setUsers] = useState<CollaborationPresenceUser[]>([]);
  const [is_synced, set_is_synced] = useState(false);
  const initial_content_ref = useRef<JSONContent | null>(initial_content);
  const has_synced_ref = useRef(false);

  useEffect(() => {
    initial_content_ref.current = initial_content;
  }, [initial_content]);

  const try_bootstrap_document = useCallback((collaboration_document: Y.Doc | null) => {
    const content_to_bootstrap = initial_content_ref.current;

    if (!has_synced_ref.current || collaboration_document === null) {
      return;
    }

    if (!has_bootstrap_content(content_to_bootstrap)) {
      return;
    }

    if (!is_collaboration_document_empty(collaboration_document)) {
      return;
    }

    try {
      bootstrap_collaboration_document(collaboration_document, content_to_bootstrap);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    try_bootstrap_document(ydoc);
  }, [ydoc, initial_content, try_bootstrap_document]);

  useEffect(() => {
    if (!enabled || !document_id || !token || !user_id || !user_name) {
      has_synced_ref.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional cleanup when deps are invalid
      setYdoc(null);
      setProvider(null);
      setConnectionStatus("disconnected");
      setUsers([]);
      set_is_synced(false);
      return;
    }

    has_synced_ref.current = false;
    set_is_synced(false);

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

    const handle_sync = (is_synced: boolean) => {
      has_synced_ref.current = is_synced;
      set_is_synced(is_synced);

      if (!is_synced) {
        return;
      }

      try_bootstrap_document(session.ydoc);
    };

    session.provider.on("status", handle_status);
    session.provider.on("sync", handle_sync);
    session.provider.awareness.on("change", handle_awareness_change);
    handle_awareness_change();
    session.provider.connect();

    return () => {
      session.provider.off("status", handle_status);
      session.provider.off("sync", handle_sync);
      session.provider.awareness.off("change", handle_awareness_change);
      has_synced_ref.current = false;
      set_is_synced(false);
      setConnectionStatus("disconnected");
      setUsers([]);
      setProvider(null);
      setYdoc(null);
      destroyCollaborationSession(session);
    };
  }, [enabled, document_id, token, user_id, user_name, server_url, try_bootstrap_document]);

  return useMemo(
    () => ({
      ydoc,
      provider,
      connection_status,
      users,
      is_synced,
      is_ready: provider !== null && ydoc !== null,
    }),
    [ydoc, provider, connection_status, users, is_synced],
  );
}
