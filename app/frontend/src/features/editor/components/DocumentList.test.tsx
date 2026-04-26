// @vitest-environment jsdom
/** Unit tests for DocumentList. Validates workspace/document home actions and user-visible feedback. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { DocumentList } from "./DocumentList";

const mock_navigate = vi.fn();
const mock_create_workspace = vi.fn();
const mock_create_document = vi.fn();
const mock_move_document = vi.fn();
const mock_update_document = vi.fn();
const mock_update_workspace = vi.fn();
const mock_delete_workspace = vi.fn();
const mock_delete_document = vi.fn();
const mock_create_folder = vi.fn();
const mock_update_folder = vi.fn();
const mock_delete_folder = vi.fn();
const mock_invite_workspace = vi.fn();

let create_workspace_is_pending = false;
let create_document_is_pending = false;
let create_folder_is_pending = false;
let update_folder_is_pending = false;
let delete_folder_is_pending = false;

let current_workspaces: Array<Record<string, unknown>> = [];
let current_shared_documents: Array<Record<string, unknown>> = [];
let current_workspace_documents: Record<string, Array<Record<string, unknown>>> = {};
let current_workspace_folders: Record<string, Array<Record<string, unknown>>> = {};

vi.mock("react-router-dom", () => ({
  useNavigate: () => mock_navigate,
  useLocation: () => ({ pathname: "/documents", state: null }),
}));

vi.mock("../../../components/ui/Button", () => ({
  Button: ({
    children,
    isLoading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean }) => (
    <button {...props} aria-busy={isLoading || undefined}>
      {children}
    </button>
  ),
}));

vi.mock("../hooks/useWorkspaces", () => ({
  useWorkspaces: () => ({
    data: current_workspaces,
    isLoading: false,
  }),
  useCreateWorkspace: () => ({
    mutateAsync: mock_create_workspace,
    isPending: create_workspace_is_pending,
  }),
}));

vi.mock("../hooks/useDocuments", () => ({
  useDocuments: (workspaceId?: string) => ({
    data: workspaceId ? (current_workspace_documents[workspaceId] ?? []) : [],
    isLoading: false,
    error: null,
  }),
  useSharedDocuments: () => ({
    data: current_shared_documents,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../hooks/useCreateDocument", () => ({
  useCreateDocument: () => ({
    mutateAsync: mock_create_document,
    isPending: create_document_is_pending,
  }),
}));

vi.mock("../hooks/useFolders", () => ({
  useFolders: (workspaceId?: string) => ({
    data: workspaceId ? (current_workspace_folders[workspaceId] ?? []) : [],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../hooks/useCreateFolder", () => ({
  useCreateFolder: () => ({
    mutateAsync: mock_create_folder,
    isPending: create_folder_is_pending,
  }),
}));

vi.mock("../hooks/useUpdateFolder", () => ({
  useUpdateFolder: () => ({
    mutateAsync: mock_update_folder,
    isPending: update_folder_is_pending,
  }),
}));

vi.mock("../hooks/useDeleteFolder", () => ({
  useDeleteFolder: () => ({
    mutateAsync: mock_delete_folder,
    isPending: delete_folder_is_pending,
  }),
}));

vi.mock("../hooks/useMoveDocument", () => ({
  useMoveDocument: () => ({
    mutateAsync: mock_move_document,
    isPending: false,
  }),
}));

vi.mock("../hooks/useUpdateDocument", () => ({
  useUpdateDocument: () => ({
    mutateAsync: mock_update_document,
    isPending: false,
  }),
}));

vi.mock("../hooks/useUpdateWorkspace", () => ({
  useUpdateWorkspace: () => ({
    mutateAsync: mock_update_workspace,
    isPending: false,
  }),
}));

vi.mock("../hooks/useDeleteWorkspace", () => ({
  useDeleteWorkspace: () => ({
    mutateAsync: mock_delete_workspace,
    isPending: false,
  }),
}));

vi.mock("../hooks/useDeleteDocument", () => ({
  useDeleteDocument: () => ({
    mutateAsync: mock_delete_document,
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
  createDocument: mock_create_document,
  updateDocument: mock_update_document,
  deleteDocument: vi.fn(),
}));

describe("DocumentList", () => {
  /** Resets hook state and mutation spies between tests. */
  beforeEach(() => {
    vi.clearAllMocks();
    current_workspaces = [];
    current_shared_documents = [];
    current_workspace_documents = {};
    current_workspace_folders = {};
    create_workspace_is_pending = false;
    create_document_is_pending = false;
    create_folder_is_pending = false;
    update_folder_is_pending = false;
    delete_folder_is_pending = false;
  });

  function open_workspace(name: string) {
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`open workspace ${name}`, "i") }),
    );
  }

  /** Verifies that the home screen preserves personal/shared/direct-share groupings. */
  it("groups personal documents separately from shared workspaces and direct shares", () => {
    // Arrange
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal" },
      { id: "ws-shared", kind: "shared", name: "Team Space", role: "owner" },
      { id: "ws-external", kind: "shared", name: "Client Space", role: "member" },
    ];
    current_workspace_documents = {
      "ws-personal": [
        {
          id: "doc-personal",
          title: "Private notes",
          workspace_id: "ws-personal",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
      "ws-shared": [
        {
          id: "doc-shared",
          title: "Team brief",
          workspace_id: "ws-shared",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
      "ws-external": [],
    };
    current_shared_documents = [
      {
        id: "doc-direct",
        title: "Shared by email",
        workspace_id: "ws-shared",
        updated_at: "2026-04-25T00:00:00.000Z",
      },
    ];

    // Act
    render(<DocumentList />);

    // Assert
    expect(screen.getByRole("heading", { name: /personal workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /my workspaces/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /shared workspaces/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /directly shared documents/i })).toBeInTheDocument();
    expect(screen.getByText("Shared by email")).toBeInTheDocument();

    open_workspace("Personal");
    expect(screen.getByText("Private notes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /move document private notes/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^caret$/i }));
    open_workspace("Team Space");
    expect(screen.getByText("Team brief")).toBeInTheDocument();
  });

  /** Verifies that shared workspaces and blank documents use their existing creation flows. */
  it("creates shared workspaces and keeps blank documents on the personal path", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal" }];
    current_workspace_documents = { "ws-personal": [] };
    mock_create_workspace.mockResolvedValueOnce({ id: "ws-shared-new" });
    mock_create_document.mockResolvedValueOnce({ id: "doc-new" });

    render(<DocumentList />);

    // Act
    fireEvent.click(screen.getByRole("button", { name: /new workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /blank document/i }));

    // Assert
    await waitFor(() =>
      expect(mock_create_workspace).toHaveBeenCalledWith({ name: "New workspace", kind: "shared" }),
    );
    expect(mock_create_document).toHaveBeenCalledWith("ws-personal");
  });

  /** Verifies that workspace creation failures surface through the visible toast path. */
  it("shows a toast when creating a new workspace fails", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal" }];
    current_workspace_documents = { "ws-personal": [] };
    mock_create_workspace.mockRejectedValueOnce(new Error("Workspace create failed"));

    render(<DocumentList />);

    // Act
    fireEvent.click(screen.getByRole("button", { name: /new workspace/i }));

    // Assert
    expect(await screen.findByRole("status")).toHaveTextContent(/workspace create failed/i);
  });

  /** Verifies that the bootstrap path surfaces failures and blocks duplicate clicks while pending. */
  it("shows a toast and guards duplicate bootstrap clicks when creating a blank document without a personal workspace", async () => {
    // Arrange
    let resolve_workspace_creation: (value: { id: string }) => void = () => undefined;
    current_workspaces = [];
    current_workspace_documents = {};
    mock_create_workspace.mockImplementationOnce(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolve_workspace_creation = resolve;
        }),
    );

    render(<DocumentList />);
    const blank_document_button = screen.getAllByRole("button", { name: /blank document/i })[0];

    // Act
    fireEvent.click(blank_document_button);

    // Assert
    await waitFor(() => expect(blank_document_button).toBeDisabled());

    // Act
    fireEvent.click(blank_document_button);

    // Assert
    expect(mock_create_workspace).toHaveBeenCalledTimes(1);

    // Act
    mock_create_document.mockRejectedValueOnce(new Error("Document bootstrap failed"));
    resolve_workspace_creation({ id: "ws-personal" });

    // Assert
    expect(await screen.findByRole("status")).toHaveTextContent(/document bootstrap failed/i);
  });

  /** Verifies that newly visible shared workspaces announce themselves with a toast. */
  it("shows a contextual toast when a shared workspace appears after the initial load", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal" }];
    current_workspace_documents = { "ws-personal": [] };

    const { rerender } = render(<DocumentList />);

    // Act
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal" },
      { id: "ws-shared", kind: "shared", name: "Team Space" },
    ];
    current_workspace_documents = {
      "ws-personal": [],
      "ws-shared": [{ id: "doc-shared", title: "Team brief", workspace_id: "ws-shared" }],
    };
    rerender(<DocumentList />);

    // Assert
    expect(await screen.findByRole("status")).toHaveTextContent(/team space/i);
  });

  /** Verifies that a shared workspace can be renamed from the list. */
  it("shows workspace actions and renames a workspace", async () => {
    // Arrange
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal", role: "owner" },
      { id: "ws-shared", kind: "shared", name: "Team Space", role: "owner" },
    ];
    current_workspace_documents = {
      "ws-personal": [],
      "ws-shared": [
        {
          id: "doc-shared",
          title: "Team brief",
          workspace_id: "ws-shared",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };

    render(<DocumentList />);

    // Act
    open_workspace("Team Space");
    fireEvent.click(screen.getByRole("button", { name: /rename workspace team space/i }));
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: "Studio" } });
    fireEvent.click(screen.getByRole("button", { name: /save workspace/i }));

    // Assert
    await waitFor(() =>
      expect(mock_update_workspace).toHaveBeenCalledWith({
        workspaceId: "ws-shared",
        data: { name: "Studio" },
      }),
    );
  });

  /** Verifies that shared workspaces expose a share action and submit invites from the home UI. */
  it("shares a shared workspace from the workspace header", async () => {
    // Arrange
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal", role: "owner" },
      { id: "ws-shared", kind: "shared", name: "Team Space", role: "member" },
    ];
    current_workspace_documents = {
      "ws-personal": [],
      "ws-shared": [],
    };
    current_workspace_folders = {
      "ws-personal": [],
      "ws-shared": [],
    };

    render(<DocumentList />);

    // Act
    open_workspace("Team Space");
    fireEvent.click(screen.getByRole("button", { name: /share workspace team space/i }));
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "teammate@caret.page" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    // Assert
    await waitFor(() =>
      expect(mock_invite_workspace).toHaveBeenCalledWith({ email: "teammate@caret.page" }),
    );
  });

  /** Verifies that a personal workspace can also be renamed from the list. */
  it("shows workspace actions and renames a personal workspace", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = {
      "ws-personal": [],
    };

    render(<DocumentList />);

    // Act
    open_workspace("Personal");
    fireEvent.click(screen.getByRole("button", { name: /rename workspace personal/i }));
    fireEvent.change(screen.getByLabelText(/workspace name/i), {
      target: { value: "Private Studio" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save workspace/i }));

    // Assert
    await waitFor(() =>
      expect(mock_update_workspace).toHaveBeenCalledWith({
        workspaceId: "ws-personal",
        data: { name: "Private Studio" },
      }),
    );
  });

  /** Verifies that document deletion requires confirmation before mutating. */
  it("confirms and deletes a document", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = {
      "ws-personal": [
        {
          id: "doc-personal",
          title: "Private notes",
          workspace_id: "ws-personal",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };

    render(<DocumentList />);

    // Act
    open_workspace("Personal");
    fireEvent.click(screen.getByRole("button", { name: /delete private notes/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete document/i }));

    // Assert
    await waitFor(() => expect(mock_delete_document).toHaveBeenCalledWith("doc-personal"));
  });

  /** Verifies that a document can be renamed from the home list with the shared modal flow. */
  it("renames a document from the list", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = {
      "ws-personal": [
        {
          id: "doc-personal",
          title: "Private notes",
          workspace_id: "ws-personal",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };

    render(<DocumentList />);

    // Act
    open_workspace("Personal");
    fireEvent.click(screen.getByRole("button", { name: /rename private notes/i }));
    fireEvent.change(screen.getByLabelText(/document name/i), {
      target: { value: "Project notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save document/i }));

    // Assert
    await waitFor(() =>
      expect(mock_update_document).toHaveBeenCalledWith({
        documentId: "doc-personal",
        data: { title: "Project notes" },
      }),
    );
  });

  /** Verifies that rename failures surface through the existing toast error path. */
  it("shows a toast when document rename fails", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = {
      "ws-personal": [
        {
          id: "doc-personal",
          title: "Private notes",
          workspace_id: "ws-personal",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };
    mock_update_document.mockRejectedValueOnce(new Error("Rename failed"));

    render(<DocumentList />);

    // Act
    open_workspace("Personal");
    fireEvent.click(screen.getByRole("button", { name: /rename private notes/i }));
    fireEvent.change(screen.getByLabelText(/document name/i), {
      target: { value: "Project notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save document/i }));

    // Assert
    expect(await screen.findByRole("status")).toHaveTextContent(/rename failed/i);
  });

  /** Verifies that workspace deletion requires confirmation before mutating. */
  it("confirms and deletes a workspace", async () => {
    // Arrange
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal", role: "owner" },
      { id: "ws-shared", kind: "shared", name: "Team Space", role: "owner" },
    ];
    current_workspace_documents = {
      "ws-personal": [],
      "ws-shared": [],
    };

    render(<DocumentList />);

    // Act
    open_workspace("Team Space");
    fireEvent.click(screen.getByRole("button", { name: /delete workspace team space/i }));

    // Assert
    expect(
      screen.getByText(/documents and their contents will also be deleted/i),
    ).toBeInTheDocument();

    // Act
    fireEvent.click(screen.getByRole("button", { name: /confirm delete workspace/i }));

    // Assert
    await waitFor(() => expect(mock_delete_workspace).toHaveBeenCalledWith("ws-shared"));
  });

  /** Verifies that a personal workspace can also be deleted from the list. */
  it("confirms and deletes a personal workspace", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = {
      "ws-personal": [],
    };

    render(<DocumentList />);

    // Act
    open_workspace("Personal");
    fireEvent.click(screen.getByRole("button", { name: /delete workspace personal/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete workspace/i }));

    // Assert
    await waitFor(() => expect(mock_delete_workspace).toHaveBeenCalledWith("ws-personal"));
  });

  /** Verifies that backend rename conflicts are shown to the user. */
  it("renders a visible error when workspace rename collides with an existing name", async () => {
    // Arrange
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal", role: "owner" },
      { id: "ws-shared", kind: "shared", name: "Team Space", role: "owner" },
    ];
    current_workspace_documents = {
      "ws-personal": [],
      "ws-shared": [],
    };
    mock_update_workspace.mockRejectedValueOnce(new Error("Workspace name already exists"));

    render(<DocumentList />);

    // Act
    open_workspace("Team Space");
    fireEvent.click(screen.getByRole("button", { name: /rename workspace team space/i }));
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: "Personal" } });
    fireEvent.click(screen.getByRole("button", { name: /save workspace/i }));

    // Assert
    expect(await screen.findByRole("status")).toHaveTextContent(/workspace name already exists/i);
  });

  /** Verifies that shared workspaces hide destructive actions for non-owner roles. */
  it("hides rename and delete actions for shared workspaces without an owner role", () => {
    // Arrange
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal", role: "owner" },
      { id: "ws-shared", kind: "shared", name: "Team Space", role: "member" },
    ];
    current_workspace_documents = {
      "ws-personal": [],
      "ws-shared": [],
    };

    // Act
    render(<DocumentList />);

    // Assert
    expect(
      screen.queryByRole("button", { name: /rename workspace team space/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete workspace team space/i }),
    ).not.toBeInTheDocument();
  });

  /** Verifies that directly shared documents do not expose destructive actions in this task. */
  it("hides delete actions for directly shared documents", () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = { "ws-personal": [] };
    current_shared_documents = [
      {
        id: "doc-direct",
        title: "Shared by email",
        workspace_id: "ws-shared",
        updated_at: "2026-04-25T00:00:00.000Z",
      },
    ];

    // Act
    render(<DocumentList />);

    // Assert
    expect(
      screen.queryByRole("button", { name: /delete shared by email/i }),
    ).not.toBeInTheDocument();
  });

  /** Verifies that move failures are surfaced to the user instead of bubbling unhandled. */
  it("shows a visible error when moving a document fails", async () => {
    // Arrange
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal", role: "owner" },
      { id: "ws-shared", kind: "shared", name: "Team Space", role: "owner" },
    ];
    current_workspace_documents = {
      "ws-personal": [
        {
          id: "doc-personal",
          title: "Private notes",
          workspace_id: "ws-personal",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
      "ws-shared": [],
    };
    mock_move_document.mockRejectedValueOnce(new Error("Move failed"));

    render(<DocumentList />);

    // Act
    open_workspace("Personal");
    fireEvent.click(screen.getByRole("button", { name: /move document private notes/i }));
    fireEvent.click(screen.getByRole("button", { name: /^move document$/i }));

    // Assert
    expect(await screen.findByRole("status")).toHaveTextContent(/move failed/i);
  });

  /** Verifies that document move can target a folder inside the selected workspace. */
  it("moves a document into the selected workspace folder", async () => {
    // Arrange
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal", role: "owner" },
      { id: "ws-shared", kind: "shared", name: "Team Space", role: "owner" },
      { id: "ws-shared-2", kind: "shared", name: "Studio", role: "owner" },
    ];
    current_workspace_documents = {
      "ws-personal": [
        {
          id: "doc-personal",
          title: "Private notes",
          workspace_id: "ws-personal",
          folder_id: null,
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
      "ws-shared": [],
      "ws-shared-2": [],
    };
    current_workspace_folders = {
      "ws-personal": [],
      "ws-shared": [
        {
          id: "folder-team",
          workspace_id: "ws-shared",
          parent_folder_id: null,
          name: "Projects",
          sort_order: null,
          created_by_user_id: "user-1",
          created_at: "2026-04-25T00:00:00.000Z",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
      "ws-shared-2": [
        {
          id: "folder-studio",
          workspace_id: "ws-shared-2",
          parent_folder_id: null,
          name: "Archive",
          sort_order: null,
          created_by_user_id: "user-1",
          created_at: "2026-04-25T00:00:00.000Z",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };

    render(<DocumentList />);

    // Act
    open_workspace("Personal");
    fireEvent.click(screen.getByRole("button", { name: /move document private notes/i }));
    fireEvent.click(screen.getByRole("radio", { name: /studio/i }));
    fireEvent.click(screen.getByRole("radio", { name: /archive/i }));
    fireEvent.click(screen.getByRole("button", { name: /^move document$/i }));

    // Assert
    await waitFor(() =>
      expect(mock_move_document).toHaveBeenCalledWith({
        documentId: "doc-personal",
        workspaceId: "ws-shared-2",
        folderId: "folder-studio",
      }),
    );
  });

  /** Verifies that the empty move dialog still places initial focus on a control inside the modal. */
  it("keeps initial focus inside the move dialog when there are no shared workspaces", () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = {
      "ws-personal": [
        {
          id: "doc-personal",
          title: "Private notes",
          workspace_id: "ws-personal",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };

    render(<DocumentList />);

    // Act
    open_workspace("Personal");
    fireEvent.click(screen.getByRole("button", { name: /move document private notes/i }));

    // Assert
    expect(screen.getByRole("radio", { name: /personal/i })).toHaveFocus();
  });

  /** Verifies that stale move selections reset safely when the shared workspace list changes. */
  it("resets the move selection when the selected workspace disappears", () => {
    // Arrange
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal", role: "owner" },
      { id: "ws-shared", kind: "shared", name: "Team Space", role: "owner" },
    ];
    current_workspace_documents = {
      "ws-personal": [
        {
          id: "doc-personal",
          title: "Private notes",
          workspace_id: "ws-personal",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
      "ws-shared": [],
    };

    const { rerender } = render(<DocumentList />);

    // Act
    open_workspace("Personal");
    fireEvent.click(screen.getByRole("button", { name: /move document private notes/i }));
    expect(screen.getByRole("button", { name: /^move document$/i })).toBeEnabled();

    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    rerender(<DocumentList />);

    // Assert
    expect(screen.getByRole("button", { name: /^move document$/i })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /personal/i })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /team space/i })).not.toBeInTheDocument();
  });

  /** Verifies that dialogs expose modal semantics, initial focus, escape close, and focus return. */
  it("adds accessible dialog semantics and restores focus to the trigger", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = { "ws-personal": [] };

    render(<DocumentList />);
    open_workspace("Personal");

    const rename_button = screen.getByRole("button", { name: /rename workspace personal/i });

    // Act
    fireEvent.click(rename_button);

    // Assert
    const dialog = screen.getByRole("dialog", { name: /rename workspace/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText(/workspace name/i)).toHaveFocus();

    // Act
    fireEvent.keyDown(dialog, { key: "Escape" });

    // Assert
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /rename workspace/i })).not.toBeInTheDocument(),
    );
    expect(rename_button).toHaveFocus();
  });

  /** Verifies that keyboard tabbing stays trapped inside the open dialog. */
  it("traps keyboard focus inside the dialog while open", () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = { "ws-personal": [] };

    render(<DocumentList />);
    open_workspace("Personal");

    // Act
    fireEvent.click(screen.getByRole("button", { name: /rename workspace personal/i }));

    const dialog = screen.getByRole("dialog", { name: /rename workspace/i });
    const input = screen.getByLabelText(/workspace name/i);
    const cancel_button = screen.getByRole("button", { name: /cancel/i });
    const save_button = screen.getByRole("button", { name: /save workspace/i });

    // Assert
    expect(input).toBeInTheDocument();

    // Act
    save_button.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });

    // Assert
    expect(input).toHaveFocus();

    // Act
    input.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });

    // Assert
    expect(save_button).toHaveFocus();
    expect(cancel_button).not.toHaveFocus();
  });

  /** Verifies that successful destructive actions fall back to a stable focus target when the trigger disappears. */
  it("falls back to the page heading when the original delete trigger is removed", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = {
      "ws-personal": [
        {
          id: "doc-personal",
          title: "Private notes",
          workspace_id: "ws-personal",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };

    let rerender_document_list: ((ui: React.ReactNode) => void) | null = null;
    mock_delete_document.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            current_workspace_documents = { "ws-personal": [] };
            rerender_document_list?.(<DocumentList />);
            resolve();
          }, 0);
        }),
    );

    const { rerender } = render(<DocumentList />);
    rerender_document_list = rerender;

    open_workspace("Personal");
    const delete_button = screen.getByRole("button", { name: /delete private notes/i });

    // Act
    fireEvent.click(delete_button);
    fireEvent.click(screen.getByRole("button", { name: /confirm delete document/i }));

    // Assert
    await waitFor(() => expect(screen.getByRole("heading", { name: /documents/i })).toHaveFocus());
  });

  /** Verifies that folder creation uses the selected workspace and current root context. */
  it("creates a folder in the selected workspace", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = { "ws-personal": [] };
    current_workspace_folders = { "ws-personal": [] };
    mock_create_folder.mockResolvedValueOnce({ id: "folder-new", workspace_id: "ws-personal" });

    render(<DocumentList />);
    open_workspace("Personal");

    // Act
    fireEvent.click(screen.getByRole("button", { name: /new folder/i }));
    fireEvent.change(screen.getByLabelText(/folder name/i), { target: { value: "Projects" } });
    fireEvent.click(screen.getByRole("button", { name: /create folder/i }));

    // Assert
    await waitFor(() =>
      expect(mock_create_folder).toHaveBeenCalledWith({
        workspaceId: "ws-personal",
        name: "Projects",
        parentFolderId: null,
      }),
    );
  });

  /** Verifies that selecting a folder hides root documents and shows only its children. */
  it("filters visible documents when selecting a folder", () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = {
      "ws-personal": [
        {
          id: "doc-root",
          title: "Root doc",
          workspace_id: "ws-personal",
          folder_id: null,
          updated_at: "2026-04-25T00:00:00.000Z",
        },
        {
          id: "doc-folder",
          title: "Folder doc",
          workspace_id: "ws-personal",
          folder_id: "folder-a",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };
    current_workspace_folders = {
      "ws-personal": [
        {
          id: "folder-a",
          workspace_id: "ws-personal",
          parent_folder_id: null,
          name: "Projects",
          sort_order: null,
          created_by_user_id: "user-1",
          created_at: "2026-04-25T00:00:00.000Z",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };

    render(<DocumentList />);
    open_workspace("Personal");

    // Assert
    expect(screen.getByText("Root doc")).toBeInTheDocument();
    expect(screen.queryByText("Folder doc")).not.toBeInTheDocument();

    // Act
    fireEvent.click(screen.getByRole("button", { name: /projects folder/i }));

    // Assert
    expect(screen.queryByText("Root doc")).not.toBeInTheDocument();
    expect(screen.getByText("Folder doc")).toBeInTheDocument();
  });

  /** Verifies that folder rename uses the selected folder and updated name. */
  it("renames a folder", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = { "ws-personal": [] };
    current_workspace_folders = {
      "ws-personal": [
        {
          id: "folder-a",
          workspace_id: "ws-personal",
          parent_folder_id: null,
          name: "Projects",
          sort_order: null,
          created_by_user_id: "user-1",
          created_at: "2026-04-25T00:00:00.000Z",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };

    render(<DocumentList />);
    open_workspace("Personal");

    // Act
    fireEvent.click(screen.getByRole("button", { name: /projects folder/i }));
    fireEvent.click(screen.getByRole("button", { name: /rename folder projects/i }));
    fireEvent.change(screen.getByLabelText(/folder name/i), { target: { value: "Archive" } });
    fireEvent.click(screen.getByRole("button", { name: /save folder/i }));

    // Assert
    await waitFor(() =>
      expect(mock_update_folder).toHaveBeenCalledWith({
        folderId: "folder-a",
        data: { name: "Archive" },
      }),
    );
  });

  /** Verifies that folder deletion requires confirmation before mutating. */
  it("deletes a folder with confirmation", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = { "ws-personal": [] };
    current_workspace_folders = {
      "ws-personal": [
        {
          id: "folder-a",
          workspace_id: "ws-personal",
          parent_folder_id: null,
          name: "Projects",
          sort_order: null,
          created_by_user_id: "user-1",
          created_at: "2026-04-25T00:00:00.000Z",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };

    render(<DocumentList />);
    open_workspace("Personal");

    // Act
    fireEvent.click(screen.getByRole("button", { name: /projects folder/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete folder projects/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete folder/i }));

    // Assert
    await waitFor(() =>
      expect(mock_delete_folder).toHaveBeenCalledWith({
        folderId: "folder-a",
        workspaceId: "ws-personal",
        documentIds: [],
      }),
    );
  });

  /** Verifies that workspace-local document creation uses the selected folder. */
  it("creates a document inside the selected folder", async () => {
    // Arrange
    current_workspaces = [{ id: "ws-personal", kind: "personal", name: "Personal", role: "owner" }];
    current_workspace_documents = { "ws-personal": [] };
    current_workspace_folders = {
      "ws-personal": [
        {
          id: "folder-a",
          workspace_id: "ws-personal",
          parent_folder_id: null,
          name: "Projects",
          sort_order: null,
          created_by_user_id: "user-1",
          created_at: "2026-04-25T00:00:00.000Z",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };
    mock_create_document.mockResolvedValueOnce({ id: "doc-folder-new" });

    render(<DocumentList />);
    open_workspace("Personal");
    const workspace_section = screen.getByRole("heading", { name: "Personal" }).closest("section");

    if (!workspace_section) {
      throw new Error("Workspace section not found");
    }

    // Act
    fireEvent.click(screen.getByRole("button", { name: /projects folder/i }));
    fireEvent.click(within(workspace_section).getByRole("button", { name: /new document/i }));

    // Assert
    await waitFor(() =>
      expect(mock_create_document).toHaveBeenCalledWith({
        workspaceId: "ws-personal",
        folderId: "folder-a",
      }),
    );
  });

  /** Verifies that shared workspace members without owner access cannot create folders. */
  it("hides folder creation for shared workspaces without an owner role", () => {
    // Arrange
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal", role: "owner" },
      { id: "ws-shared", kind: "shared", name: "Team Space", role: "member" },
    ];
    current_workspace_documents = {
      "ws-personal": [],
      "ws-shared": [],
    };
    current_workspace_folders = {
      "ws-personal": [],
      "ws-shared": [],
    };

    // Act
    render(<DocumentList />);
    open_workspace("Personal");
    const personal_workspace_section = screen
      .getByRole("heading", { name: "Personal" })
      .closest("section");

    if (!personal_workspace_section) {
      throw new Error("Expected personal workspace section to render");
    }

    // Assert
    expect(
      within(personal_workspace_section).getByRole("button", { name: /new folder/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^caret$/i }));
    open_workspace("Team Space");
    const shared_workspace_section = screen
      .getByRole("heading", { name: "Team Space" })
      .closest("section");

    if (!shared_workspace_section) {
      throw new Error("Expected shared workspace section to render");
    }

    expect(
      within(shared_workspace_section).queryByRole("button", { name: /new folder/i }),
    ).not.toBeInTheDocument();
  });

  /** Verifies that shared workspace non-owners cannot manage folders or delete shared documents. */
  it("hides shared folder and document destructive actions for non-owner members", () => {
    // Arrange
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal", role: "owner" },
      { id: "ws-shared", kind: "shared", name: "Team Space", role: "member" },
    ];
    current_workspace_documents = {
      "ws-personal": [],
      "ws-shared": [
        {
          id: "doc-shared",
          title: "Team brief",
          workspace_id: "ws-shared",
          folder_id: "folder-a",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };
    current_workspace_folders = {
      "ws-personal": [],
      "ws-shared": [
        {
          id: "folder-a",
          workspace_id: "ws-shared",
          parent_folder_id: null,
          name: "Projects",
          sort_order: null,
          created_by_user_id: "user-1",
          created_at: "2026-04-25T00:00:00.000Z",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
      ],
    };

    render(<DocumentList />);
    fireEvent.click(screen.getByRole("button", { name: /open workspace team space/i }));
    const shared_workspace_section = screen
      .getByRole("heading", { name: "Team Space" })
      .closest("section");

    if (!shared_workspace_section) {
      throw new Error("Shared workspace section not found");
    }

    // Act
    fireEvent.click(
      within(shared_workspace_section).getByRole("button", { name: /projects folder/i }),
    );

    // Assert
    expect(
      within(shared_workspace_section).queryByRole("button", { name: /rename folder projects/i }),
    ).not.toBeInTheDocument();
    expect(
      within(shared_workspace_section).queryByRole("button", { name: /delete folder projects/i }),
    ).not.toBeInTheDocument();
    expect(
      within(shared_workspace_section).queryByRole("button", { name: /delete team brief/i }),
    ).not.toBeInTheDocument();
  });
});
