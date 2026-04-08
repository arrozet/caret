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
let set_content_call_count = 0;
let latest_caret_editor_props: Record<string, unknown> | null = null;

const mock_commands_set_content = vi.fn((next_content: JSONContent): boolean => {
  set_content_call_count += 1;

  // First call is the preview-apply attempt (simulate a failure/no-op).
  if (set_content_call_count === 1) {
    return false;
  }

  // Second call is the Accept-path force-apply.
  current_json = next_content;
  current_text = "Hola.";
  current_html = "<p>Hola.</p>";
  return true;
});

const fake_editor = {
  isDestroyed: false,
  commands: {
    setContent: mock_commands_set_content,
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
    isPanelOpen: false,
    togglePanel: mock_toggle_panel,
    activeConversationId: null,
    pendingDocumentChange: current_pending_change,
    setPendingDocumentChange: mock_set_pending_document_change,
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
    ydoc: { id: "collab-doc" },
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
  indexDocumentEmbeddings: (...args: unknown[]) => mock_index_document_embeddings(...args),
}));

vi.mock("./CaretEditor", () => ({
  CaretEditor: ({ onEditorReady, ...props }: { onEditorReady?: (editor: Editor) => void }) => {
    latest_caret_editor_props = props;

    useEffect(() => {
      onEditorReady?.(fake_editor);
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
    set_content_call_count = 0;
    latest_caret_editor_props = null;

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

  it("accept applies and persists proposed text even when initial preview setContent fails", async () => {
    // Arrange
    render(<EditorPage />);

    await waitFor(() => {
      expect(mock_commands_set_content).toHaveBeenCalled();
    });

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    // Assert
    await waitFor(
      () => {
        expect(mock_mutate_async).toHaveBeenCalled();
      },
      { timeout: 1_600 },
    );

    const last_call = mock_mutate_async.mock.calls.at(-1)?.[0] as
      | { content_text?: string }
      | undefined;
    expect(last_call?.content_text).toBe("Hola.");
  });

  /** Verifies collaboration bootstrap injects a shared Y.Doc into CaretEditor. */
  it("passes collaboration_document to CaretEditor", () => {
    // Arrange
    render(<EditorPage />);

    // Act
    const collaboration_document = latest_caret_editor_props?.collaborationDocument;

    // Assert
    expect(collaboration_document).toEqual({ id: "collab-doc" });
  });

  /** Verifies invite dialog submits the email through collaboration invite mutation. */
  it("submits collaborator invite by email", async () => {
    // Arrange
    render(<EditorPage />);

    // Act
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "juan@nombre.es" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    // Assert
    await waitFor(() => {
      expect(mock_invite_mutate_async).toHaveBeenCalledWith({
        email: "juan@nombre.es",
      });
    });
  });
});
