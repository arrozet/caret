// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import type { JSONContent, Editor } from "@tiptap/react";
import type { DocumentChangePayload } from "../../ai-assistant/api/aiApi";
import { EditorPage } from "./EditorPage";

const mock_navigate = vi.fn();
const mock_toggle_panel = vi.fn();
const mock_set_pending_document_change = vi.fn((change: DocumentChangePayload | null) => {
  current_pending_change = change;
});
const mock_add_tab = vi.fn();
const mock_update_tab_title = vi.fn();
const mock_index_document_embeddings = vi.fn();
const mock_mutate_async = vi.fn();
const mock_invite_mutate_async = vi.fn();
const mock_convert_ai_content_to_tiptap_json = vi.fn((content: string) => ({
  type: "doc",
  content: [
    {
      type: content.includes("# ") ? "heading" : "paragraph",
      attrs: content.includes("# ") ? { level: 1 } : undefined,
      content: [{ type: "text", text: content.includes("# ") ? "Title" : content }],
    },
  ],
}));
const mock_replace_collaboration_document_content = vi.fn(
  (_ydoc: unknown, content: JSONContent) => {
    current_json = content;
    current_text = extract_text_from_json(content);
    emit_editor_update();
    return true;
  },
);
let latest_chat_panel_props: Record<string, unknown> | null = null;

const initial_json: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Texto original" }],
    },
  ],
};

let current_pending_change: DocumentChangePayload | null = null;
let current_text = "Texto original";
let current_html = "<p>Texto original</p>";
let current_json: JSONContent = initial_json;
let latest_caret_editor_props: Record<string, unknown> | null = null;
let latest_caret_editor_calls: Record<string, unknown>[] = [];
let current_panel_open = false;
let should_report_editor_ready = true;
let current_collaboration_document: Record<string, unknown> | null = { id: "collab-doc" };

let current_selection = {
  empty: false,
  from: 2,
  to: 7,
};

function extract_text_from_json(content: JSONContent | undefined): string {
  if (!content) return "";
  const text_node = typeof content.text === "string" ? content.text : "";
  const child_text = Array.isArray(content.content)
    ? content.content.map((child) => extract_text_from_json(child as JSONContent)).join("\n")
    : "";
  return [text_node, child_text].filter(Boolean).join("\n").trim();
}

function sync_editor_text(next_text: string): void {
  current_text = next_text;
  current_html = `<p>${next_text}</p>`;
  current_json = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: next_text }],
      },
    ],
  };
}

function emit_editor_update(): void {
  const on_update = latest_caret_editor_props?.onUpdate as
    | ((json: JSONContent, text: string) => void)
    | undefined;
  on_update?.(current_json, current_text);
}

/**
 * Mock for editor.commands.setContent() — the only API that works
 * reliably when the Y.js Collaboration extension is active.
 */
const mock_set_content = vi.fn((content: JSONContent | string) => {
  if (typeof content === "string") {
    sync_editor_text(content);
  } else {
    current_json = content;
    current_text = extract_text_from_json(content);
  }
  emit_editor_update();
  return true;
});

const fake_editor = {
  isDestroyed: false,
  state: {
    selection: current_selection,
    doc: {
      textBetween: vi.fn(() => "Texto"),
    },
  },
  chain: vi.fn(() => fake_editor),
  focus: vi.fn(() => fake_editor),
  selectAll: vi.fn(() => fake_editor),
  insertContent: vi.fn(() => fake_editor),
  deleteRange: vi.fn(() => fake_editor),
  insertContentAt: vi.fn(() => fake_editor),
  run: vi.fn(() => true),
  commands: {
    setContent: mock_set_content,
  },
  getJSON: vi.fn(() => current_json),
  getText: vi.fn(() => current_text),
  getHTML: vi.fn(() => current_html),
} as unknown as Editor;

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "doc-1" }),
  useNavigate: () => mock_navigate,
}));

vi.mock("../hooks/useDocument", () => ({
  useDocument: () => ({
    data: {
      id: "doc-1",
      workspace_id: "ws-1",
      folder_id: null,
      title: "Doc test",
      status: "active",
      visibility: "private",
      owner_user_id: "user-1",
      content_json: initial_json,
      content_text: "Texto original",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../hooks/useSaveDocument", () => ({
  useSaveDocument: () => ({
    mutateAsync: mock_mutate_async,
  }),
}));

vi.mock("../hooks/useInviteDocumentCollaborator", () => ({
  useInviteDocumentCollaborator: () => ({
    mutateAsync: mock_invite_mutate_async,
    isPending: false,
  }),
}));

vi.mock("../../../hooks/useFocusMode", () => ({
  useFocusMode: vi.fn(),
}));

vi.mock("../../../stores/tabsStore", () => ({
  useTabsStore: () => ({
    addTab: mock_add_tab,
    updateTabTitle: mock_update_tab_title,
  }),
}));

vi.mock("../../../stores", () => {
  const store = () => ({
    isPanelOpen: current_panel_open,
    togglePanel: mock_toggle_panel,
    activeDocumentId: null,
    activeConversationId: null,
    conversationByDocumentId: {},
    pendingDocumentChange: current_pending_change,
    setPendingDocumentChange: mock_set_pending_document_change,
    setActiveDocumentId: vi.fn(),
    setConversation: vi.fn(),
    setConversationForDocument: vi.fn(),
  });
  store.getState = () => ({
    pendingDocumentChange: current_pending_change,
  });

  const auth_store = (
    selector?: (state: {
      user: { id: string; email: string };
      session: { access_token: string };
    }) => unknown,
  ) => {
    const state = {
      user: {
        id: "user-1",
        email: "test@caret.page",
      },
      session: {
        access_token: "jwt-token",
      },
    };
    return selector ? selector(state) : state;
  };

  return {
    useTabsStore: () => ({
      addTab: mock_add_tab,
      updateTabTitle: mock_update_tab_title,
    }),
    useAiStore: store,
    useAuthStore: auth_store,
  };
});

vi.mock("../../collaboration", () => ({
  LOCAL_COLLAB_WS_BASE_URL: "ws://localhost:3003/document",
  useCollaborationSession: () => ({
    ydoc: current_collaboration_document,
    provider: null,
    connection_status: "connected",
    users: [{ id: "user-1", name: "Ada", color: "#123456" }],
    is_ready: true,
  }),
  useCollaborationPresence: (users: unknown[]) => ({
    users,
    users_count: users.length,
    has_collaborators: users.length > 1,
    is_solo: users.length <= 1,
  }),
  CollaborationPresenceBar: () => <div data-testid="collab-presence" />,
}));

vi.mock("../hooks/useGhostText", () => ({
  useGhostText: vi.fn(),
}));

vi.mock("../../ai-assistant/api/aiApi", () => ({
  indexDocumentEmbeddings: (...args: [unknown, ...unknown[]]) =>
    mock_index_document_embeddings(...args),
}));

vi.mock("../utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils")>();

  return {
    ...actual,
    convert_ai_content_to_tiptap_json: (...args: [string]) =>
      mock_convert_ai_content_to_tiptap_json(...args),
    replace_collaboration_document_content: (...args: [unknown, JSONContent]) =>
      mock_replace_collaboration_document_content(...args),
  };
});

vi.mock("../../ai-assistant", () => ({
  ChatPanel: (props: Record<string, unknown>) => {
    latest_chat_panel_props = props;
    return <div data-testid="mock-chat-panel" />;
  },
}));

vi.mock("./CaretEditor", () => ({
  CaretEditor: ({ onEditorReady, ...props }: { onEditorReady?: (editor: Editor) => void }) => {
    latest_caret_editor_props = props;
    latest_caret_editor_calls.push(props);

    useEffect(() => {
      if (should_report_editor_ready) {
        onEditorReady?.(fake_editor);
      }
    }, [onEditorReady]);

    return <div data-testid="mock-caret-editor" />;
  },
}));

describe("EditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    current_pending_change = {
      operation: "replace_full",
      original_text: "Texto original",
      proposed_text: "Hola.",
    };

    current_text = "Texto original";
    current_html = "<p>Texto original</p>";
    current_json = initial_json;
    current_selection = {
      empty: false,
      from: 2,
      to: 7,
    };
    latest_caret_editor_props = null;
    latest_caret_editor_calls = [];
    latest_chat_panel_props = null;
    current_panel_open = false;
    should_report_editor_ready = true;
    current_collaboration_document = { id: "collab-doc" };
    mock_set_content.mockClear();
    mock_convert_ai_content_to_tiptap_json.mockClear();
    mock_replace_collaboration_document_content.mockClear();

    mock_mutate_async.mockResolvedValue({
      id: "doc-1",
      workspace_id: "ws-1",
      folder_id: null,
      title: "Doc test",
      status: "active",
      visibility: "private",
      owner_user_id: "user-1",
      content_json: current_json,
      content_text: current_text,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    mock_invite_mutate_async.mockResolvedValue({
      workspace_id: "ws-1",
      user_id: "user-2",
      email: "juan@nombre.es",
      role: "member",
    });
  });

  it("accept applies proposed text via collaboration document replacement and triggers autosave", async () => {
    render(<EditorPage />);

    expect(screen.getByText("AI proposed changes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(
      () => {
        expect(mock_mutate_async).toHaveBeenCalled();
      },
      { timeout: 1_600 },
    );

    expect(mock_replace_collaboration_document_content).toHaveBeenCalledTimes(1);
    expect(mock_set_content).not.toHaveBeenCalled();
    const replacement_arg = mock_replace_collaboration_document_content.mock
      .calls[0][1] as JSONContent;
    expect(replacement_arg.type).toBe("doc");
    expect(extract_text_from_json(replacement_arg)).toBe("Hola.");

    const last_call = mock_mutate_async.mock.calls.at(-1)?.[0] as
      | { content_text?: string }
      | undefined;
    expect(last_call?.content_text).toBe("Hola.");
  });

  it("accept converts AI content through the schema-aware helper", () => {
    current_pending_change = {
      operation: "replace_full",
      original_text: "Texto original",
      proposed_text: "# Title\n\n**Bold** and [link](https://example.com)",
    };

    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(mock_convert_ai_content_to_tiptap_json).toHaveBeenCalledWith(
      "# Title\n\n**Bold** and [link](https://example.com)",
    );
    expect(mock_replace_collaboration_document_content).toHaveBeenCalledTimes(1);
    const content = mock_replace_collaboration_document_content.mock.calls[0][1] as JSONContent;
    expect(content.type).toBe("doc");
    expect(content.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
  });

  it("accept falls back to editor setContent when collaboration is unavailable", () => {
    current_collaboration_document = null;

    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(mock_replace_collaboration_document_content).not.toHaveBeenCalled();
    expect(mock_set_content).toHaveBeenCalledTimes(1);
    expect(extract_text_from_json(mock_set_content.mock.calls[0][0] as JSONContent)).toBe("Hola.");
  });

  it("shows the diff overlay with additions and removals", () => {
    current_pending_change = {
      operation: "replace_full",
      original_text: "Texto original",
      proposed_text: "Hola mundo",
    };
    render(<EditorPage />);

    expect(screen.getByText("AI proposed changes")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("-1")).toBeInTheDocument();
  });

  it("reject clears the pending change without modifying editor content", () => {
    render(<EditorPage />);

    expect(screen.getByText("AI proposed changes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(mock_set_pending_document_change).toHaveBeenCalledWith(null);
    expect(mock_set_content).not.toHaveBeenCalled();
  });

  it("passes collaboration_document to CaretEditor", () => {
    current_pending_change = null;
    render(<EditorPage />);

    const collab_call = latest_caret_editor_calls.find(
      (props) => props.collaborationDocument !== undefined,
    );
    expect(collab_call?.collaborationDocument).toEqual({ id: "collab-doc" });
  });

  it("passes structured document context to ChatPanel", async () => {
    current_pending_change = null;
    current_panel_open = true;
    render(<EditorPage />);

    await waitFor(() => {
      expect(latest_chat_panel_props).not.toBeNull();
    });

    const get_document_context = latest_chat_panel_props?.get_document_context as
      | (() =>
          | {
              content_json: JSONContent;
              content_text: string;
              selection?: { from: number; to: number; text: string };
            }
          | undefined)
      | undefined;

    expect(get_document_context?.()).toEqual({
      content_json: current_json,
      content_text: current_text,
      selection: {
        from: current_selection.from,
        to: current_selection.to,
        text: "Texto",
      },
    });
  });

  it("falls back to persisted document context when the live editor is unavailable", async () => {
    current_panel_open = true;
    should_report_editor_ready = false;
    render(<EditorPage />);

    await waitFor(() => {
      expect(latest_chat_panel_props).not.toBeNull();
    });

    const get_document_context = latest_chat_panel_props?.get_document_context as
      | (() =>
          | {
              content_json: JSONContent;
              content_text: string;
              selection?: { from: number; to: number; text: string };
            }
          | undefined)
      | undefined;

    expect(get_document_context?.()).toEqual({
      content_json: initial_json,
      content_text: "Texto original",
    });
  });

  it("submits collaborator invite by email", async () => {
    render(<EditorPage />);

    fireEvent.click(screen.getByRole("button", { name: /invite/i }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "juan@nombre.es" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      expect(mock_invite_mutate_async).toHaveBeenCalledWith({
        email: "juan@nombre.es",
      });
    });
  });
});
