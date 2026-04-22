// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditorPage } from "./EditorPage";

const mock_update_document = vi.fn();
const mock_invite_document = vi.fn();
const mock_invite_workspace = vi.fn();

let current_document: Record<string, unknown> | null = null;
let current_workspaces: Array<Record<string, unknown>> = [];

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "doc-1" }),
  useNavigate: () => vi.fn(),
}));

vi.mock("../hooks/useDocument", () => ({
  useDocument: () => ({
    data: current_document,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../hooks/useWorkspaces", () => ({
  useWorkspaces: () => ({
    data: current_workspaces,
    isLoading: false,
  }),
}));

vi.mock("../hooks/useInviteDocumentCollaborator", () => ({
  useInviteDocumentCollaborator: () => ({
    mutateAsync: mock_invite_document,
    isPending: false,
  }),
}));

vi.mock("../hooks/useInviteWorkspaceCollaborator", () => ({
  useInviteWorkspaceCollaborator: () => ({
    mutateAsync: mock_invite_workspace,
    isPending: false,
  }),
}));

vi.mock("../api/documentApi", () => ({
  updateDocument: (...args: unknown[]) => mock_update_document(...args),
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
  createWorkspace: vi.fn(),
  listDocuments: vi.fn(),
  listSharedDocuments: vi.fn(),
  getDocument: vi.fn(),
  inviteDocumentCollaborator: vi.fn(),
  inviteWorkspaceCollaborator: vi.fn(),
}));

vi.mock("../../../hooks/useFocusMode", () => ({
  useFocusMode: vi.fn(),
}));

vi.mock("../../../stores", () => ({
  useTabsStore: () => ({ addTab: vi.fn(), updateTabTitle: vi.fn() }),
  useAiStore: () => ({
    isPanelOpen: false,
    togglePanel: vi.fn(),
    activeDocumentId: null,
    activeConversationId: null,
    pendingDocumentChange: null,
    setPendingDocumentChange: vi.fn(),
    setActiveDocumentId: vi.fn(),
  }),
  useAuthStore: () => ({
    user: { id: "user-1", email: "test@caret.page" },
    session: { access_token: "jwt" },
  }),
}));

vi.mock("../hooks/useSaveDocument", () => ({
  useSaveDocument: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../hooks/useGhostText", () => ({ useGhostText: vi.fn() }));

vi.mock("../../collaboration", () => ({
  LOCAL_COLLAB_WS_BASE_URL: "ws://localhost:3003/document",
  useCollaborationSession: () => ({
    ydoc: null,
    provider: null,
    connection_status: "connected",
    users: [],
    is_ready: true,
  }),
  useCollaborationPresence: () => ({
    users: [],
    users_count: 0,
    has_collaborators: false,
    is_solo: true,
  }),
  CollaborationPresenceBar: () => <div />,
}));

vi.mock("../../ai-assistant/api/aiApi", () => ({
  indexDocumentEmbeddings: vi.fn(),
}));

vi.mock("../../ai-assistant", () => ({ ChatPanel: () => <div /> }));

vi.mock("./CaretEditor", () => ({ CaretEditor: () => <div /> }));

describe("EditorPage share and move controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    current_workspaces = [];
    current_document = null;
  });

  it("shows move controls for personal documents instead of direct sharing", () => {
    // Arrange
    current_document = {
      id: "doc-1",
      workspace_id: "ws-personal",
      folder_id: null,
      title: "Personal doc",
      status: "active",
      visibility: "private",
      owner_user_id: "user-1",
      content_json: { type: "doc", content: [] },
      content_text: "",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal" },
      { id: "ws-shared", kind: "shared", name: "Team Space" },
    ];

    // Act
    render(<EditorPage />);

    // Assert
    expect(screen.getByRole("button", { name: /move to workspace/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^share$/i })).not.toBeInTheDocument();
  });

  it("shares a shared document through workspace or document scope", async () => {
    // Arrange
    current_document = {
      id: "doc-1",
      workspace_id: "ws-shared",
      folder_id: null,
      title: "Shared doc",
      status: "active",
      visibility: "workspace",
      owner_user_id: "user-1",
      content_json: { type: "doc", content: [] },
      content_text: "",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    current_workspaces = [{ id: "ws-shared", kind: "shared", name: "Team Space" }];

    // Act
    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: /^share$/i }));
    fireEvent.click(screen.getByRole("radio", { name: /workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    // Assert
    await waitFor(() => expect(mock_invite_workspace).toHaveBeenCalledWith({ email: "" }));
  });

  it("moves a personal document into a shared workspace", async () => {
    // Arrange
    current_document = {
      id: "doc-1",
      workspace_id: "ws-personal",
      folder_id: null,
      title: "Personal doc",
      status: "active",
      visibility: "private",
      owner_user_id: "user-1",
      content_json: { type: "doc", content: [] },
      content_text: "",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal" },
      { id: "ws-shared", kind: "shared", name: "Team Space" },
    ];

    // Act
    render(<EditorPage />);
    fireEvent.click(screen.getByRole("button", { name: /move to workspace/i }));
    fireEvent.click(screen.getByRole("radio", { name: /team space/i }));
    fireEvent.click(screen.getByRole("button", { name: /move document/i }));

    // Assert
    await waitFor(() =>
      expect(mock_update_document).toHaveBeenCalledWith("doc-1", {
        workspace_id: "ws-shared",
        folder_id: null,
      }),
    );
  });
});
