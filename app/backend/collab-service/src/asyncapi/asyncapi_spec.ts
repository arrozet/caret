/** AsyncAPI document for the collaboration WebSocket protocol. */
export const asyncApiSpec = {
  asyncapi: "2.6.0",
  info: {
    title: "Caret Collaboration Service",
    version: "0.1.0",
    description:
      "WebSocket API for Y.js document collaboration, including sync and awareness messages.",
  },
  servers: {
    production: {
      url: "collab.caret.page",
      protocol: "wss",
      description: "Production collaboration WebSocket endpoint.",
    },
    local: {
      url: "localhost:{port}",
      protocol: "ws",
      description: "Local collaboration WebSocket endpoint.",
      variables: {
        port: {
          default: "3003",
          description: "Collaboration service port.",
        },
      },
    },
  },
  channels: {
    "document/{doc_id}": {
      parameters: {
        doc_id: {
          description: "Document UUID to join.",
          schema: { type: "string" },
        },
      },
      bindings: {
        ws: {
          query: {
            type: "object",
            required: ["token"],
            properties: {
              token: {
                type: "string",
                description: "Supabase JWT used during the WebSocket handshake.",
              },
            },
          },
        },
      },
      subscribe: {
        summary: "Receive Y.js sync and awareness updates from collaborators.",
        message: {
          oneOf: [
            { $ref: "#/components/messages/yjsSync" },
            { $ref: "#/components/messages/yjsAwareness" },
          ],
        },
      },
      publish: {
        summary: "Send Y.js sync and awareness updates to collaborators.",
        message: {
          oneOf: [
            { $ref: "#/components/messages/yjsSync" },
            { $ref: "#/components/messages/yjsAwareness" },
          ],
        },
      },
    },
  },
  components: {
    messages: {
      yjsSync: {
        name: "YjsSync",
        title: "Y.js sync message",
        summary: "Binary Y.js document sync update. First byte is message type 0.",
        payload: {
          type: "string",
          format: "binary",
        },
      },
      yjsAwareness: {
        name: "YjsAwareness",
        title: "Y.js awareness message",
        summary: "Binary Y.js awareness update. First byte is message type 1.",
        payload: {
          type: "string",
          format: "binary",
        },
      },
    },
  },
  "x-close-codes": [
    { code: 1008, reason: "Invalid route or missing doc_id" },
    { code: 4001, reason: "Unauthorized" },
    { code: 1011, reason: "Internal Error" },
  ],
} as const;

/** HTML documentation shell for the collaboration AsyncAPI spec. */
export function renderAsyncApiDocsHtml(): string {
  const schema = JSON.stringify(asyncApiSpec).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Caret Collaboration Service Docs</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/@asyncapi/react-component@1.2.11/styles/default.min.css"
    />
    <style>
      html, body { margin: 0; min-height: 100%; background: #f8fafc; }
      body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .docs-shell { min-height: 100vh; }
      .docs-toolbar {
        align-items: center;
        background: #ffffff;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        gap: 16px;
        justify-content: space-between;
        padding: 12px 18px;
        position: sticky;
        top: 0;
        z-index: 20;
      }
      .docs-title { color: #111827; font-size: 15px; font-weight: 700; margin: 0; }
      .docs-link { color: #0f766e; font-size: 13px; text-decoration: none; }
      .docs-link:hover { text-decoration: underline; }
      #asyncapi { background: #ffffff; min-height: calc(100vh - 49px); }
      .docs-fallback {
        background: #fff7ed;
        border: 1px solid #fed7aa;
        border-radius: 8px;
        color: #7c2d12;
        display: none;
        margin: 18px;
        padding: 12px 14px;
      }
    </style>
  </head>
  <body>
    <div class="docs-shell">
      <header class="docs-toolbar">
        <h1 class="docs-title">Caret Collaboration Service</h1>
        <a class="docs-link" href="/asyncapi.json">asyncapi.json</a>
      </header>
      <div id="asyncapi"></div>
      <div id="docs-fallback" class="docs-fallback">
        AsyncAPI viewer could not load. Open <a href="/asyncapi.json">asyncapi.json</a>.
      </div>
    </div>
    <script src="https://unpkg.com/@asyncapi/react-component@1.2.11/browser/standalone/index.js"></script>
    <script>
      const schema = ${schema};
      const config = {
        show: {
          sidebar: true,
          info: true,
          servers: true,
          operations: true,
          messages: true,
          schemas: true,
          errors: true,
        },
      };

      try {
        AsyncApiStandalone.render({ schema, config }, document.getElementById("asyncapi"));
      } catch (error) {
        document.getElementById("docs-fallback").style.display = "block";
        console.error(error);
      }
    </script>
  </body>
</html>`;
}
