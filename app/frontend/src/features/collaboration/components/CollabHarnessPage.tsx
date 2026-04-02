import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { build_collab_provider_config } from "../utils/build_collab_ws_endpoint";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface AwarenessPeer {
  client_id: number;
  name: string;
}

const DEFAULT_WS_BASE_URL = import.meta.env.VITE_COLLAB_WS_URL ?? "ws://localhost:3003";
const IS_DEV_MODE = import.meta.env.DEV;

/**
 * Manual collaboration harness to verify Y.Doc sync over websocket.
 */
export function CollabHarnessPage() {
  const [ws_base_url, set_ws_base_url] = useState(DEFAULT_WS_BASE_URL);
  const [doc_id, set_doc_id] = useState("doc-1");
  const [token, set_token] = useState("");
  const [connection_status, set_connection_status] = useState<ConnectionStatus>("disconnected");
  const [status_message, set_status_message] = useState("Not connected");
  const [shared_text, set_shared_text] = useState("");
  const [awareness_peers, set_awareness_peers] = useState<AwarenessPeer[]>([]);

  const provider_ref = useRef<WebsocketProvider | null>(null);
  const y_doc_ref = useRef<Y.Doc | null>(null);
  const y_text_ref = useRef<Y.Text | null>(null);

  const ws_endpoint = useMemo(() => {
    return build_collab_provider_config(ws_base_url, doc_id, token).endpoint;
  }, [ws_base_url, doc_id, token]);

  const update_awareness_peers = useCallback(() => {
    const provider = provider_ref.current;
    if (!provider) {
      set_awareness_peers([]);
      return;
    }

    const peers = Array.from(provider.awareness.getStates().entries()).map(([client_id, state]) => {
      const fallback_name = `peer-${client_id}`;
      const name =
        typeof state?.user?.name === "string" && state.user.name.trim().length > 0
          ? state.user.name
          : fallback_name;

      return { client_id, name };
    });

    set_awareness_peers(peers);
  }, []);

  const disconnect = useCallback(() => {
    if (provider_ref.current) {
      provider_ref.current.destroy();
      provider_ref.current = null;
    }

    if (y_doc_ref.current) {
      y_doc_ref.current.destroy();
      y_doc_ref.current = null;
    }

    y_text_ref.current = null;
    set_connection_status("disconnected");
    set_status_message("Disconnected");
    set_awareness_peers([]);
  }, []);

  const connect = useCallback(() => {
    if (!doc_id.trim()) {
      set_connection_status("error");
      set_status_message("doc_id is required");
      return;
    }

    disconnect();

    const next_doc = new Y.Doc();
    const next_text = next_doc.getText("content");
    const provider_config = build_collab_provider_config(ws_base_url, doc_id, token);

    const next_provider = new WebsocketProvider(
      provider_config.server_url,
      provider_config.room_name,
      next_doc,
      {
        params: provider_config.params,
      },
    );

    next_provider.awareness.setLocalStateField("user", {
      name: `harness-${Math.floor(Math.random() * 10_000)}`,
    });

    next_provider.on("status", (event: { status: "connected" | "disconnected" }) => {
      if (event.status === "connected") {
        set_connection_status("connected");
        set_status_message("Connected");
        return;
      }

      set_connection_status("disconnected");
      set_status_message("Disconnected");
    });

    next_provider.on("connection-error", () => {
      set_connection_status("error");
      set_status_message("Connection error");
    });

    next_provider.awareness.on("change", () => {
      update_awareness_peers();
    });

    next_text.observe(() => {
      set_shared_text(next_text.toString());
    });

    provider_ref.current = next_provider;
    y_doc_ref.current = next_doc;
    y_text_ref.current = next_text;
    set_connection_status("connecting");
    set_status_message("Connecting...");
    set_shared_text(next_text.toString());
    update_awareness_peers();
  }, [disconnect, doc_id, token, update_awareness_peers, ws_base_url]);

  const handle_shared_text_change = useCallback((next_value: string) => {
    set_shared_text(next_value);

    const y_text = y_text_ref.current;
    if (!y_text) {
      return;
    }

    const current_value = y_text.toString();
    if (current_value === next_value) {
      return;
    }

    y_text.doc?.transact(() => {
      y_text.delete(0, current_value.length);
      y_text.insert(0, next_value);
    });
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  if (!IS_DEV_MODE) {
    return (
      <div className="min-h-screen bg-app text-text-primary">
        <div className="mx-auto w-full max-w-[var(--max-width-document-wide)] p-6">
          <h1 className="font-ui text-h2">Collaboration Harness</h1>
          <p className="mt-2 text-ui-base text-text-secondary">
            This debug page is available only in development.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app text-text-primary">
      <div className="mx-auto w-full max-w-[var(--max-width-document-wide)] p-4 md:p-6 space-y-4">
        <h1 className="font-ui text-h2">Collaboration Harness</h1>

        <div className="rounded-lg border border-border-subtle bg-surface p-4 space-y-3">
          <Input
            id="ws-base-url"
            label="WS base URL"
            value={ws_base_url}
            onChange={(event) => set_ws_base_url(event.target.value)}
            placeholder="ws://localhost:3003"
          />

          <Input
            id="doc-id"
            label="doc_id"
            value={doc_id}
            onChange={(event) => set_doc_id(event.target.value)}
            placeholder="doc-1"
          />

          <Input
            id="token"
            label="token"
            value={token}
            onChange={(event) => set_token(event.target.value)}
            placeholder="JWT"
          />

          <div className="text-ui-sm text-text-secondary break-all">
            Endpoint: <code>{ws_endpoint}</code>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant={connection_status === "connected" ? "danger" : "primary"}
              onClick={() => {
                if (connection_status === "connected" || connection_status === "connecting") {
                  disconnect();
                  return;
                }

                connect();
              }}
            >
              {connection_status === "connected" || connection_status === "connecting"
                ? "Disconnect"
                : "Connect"}
            </Button>
            <span className="text-ui-base">
              Status: <strong>{status_message}</strong>
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface p-4 space-y-2">
          <div className="text-ui-base">
            Peers online: <strong>{awareness_peers.length}</strong>
          </div>
          {awareness_peers.length > 0 && (
            <div className="text-ui-sm text-text-secondary">
              {awareness_peers.map((peer) => peer.name).join(", ")}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface p-4 space-y-2">
          <label htmlFor="shared-text" className="text-ui-base font-medium">
            Shared text (Y.Text: content)
          </label>
          <textarea
            id="shared-text"
            className="block w-full min-h-[280px] rounded-[4px] border border-border-subtle bg-app px-3 py-2 font-document text-body focus:outline-none focus:border-accent-main"
            value={shared_text}
            onChange={(event) => handle_shared_text_change(event.target.value)}
            placeholder="Type here in two browser windows with same doc_id"
          />
        </div>
      </div>
    </div>
  );
}
