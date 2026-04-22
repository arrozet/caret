// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DocumentList } from "./DocumentList";

const mock_navigate = vi.fn();
const mock_create_workspace = vi.fn();
const mock_create_document = vi.fn();
const mock_move_document = vi.fn();

let current_workspaces: Array<Record<string, unknown>> = [];
let current_shared_documents: Array<Record<string, unknown>> = [];
let current_workspace_documents: Record<string, Array<Record<string, unknown>>> = {};

vi.mock("react-router-dom", () => ({
  useNavigate: () => mock_navigate,
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
    isPending: false,
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
    isPending: false,
  }),
}));

vi.mock("../hooks/useMoveDocument", () => ({
  useMoveDocument: () => ({
    mutateAsync: mock_move_document,
    isPending: false,
  }),
}));

vi.mock("../api/documentApi", () => ({
  createDocument: (...args: unknown[]) => mock_create_document(...args),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

describe("DocumentList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    current_workspaces = [];
    current_shared_documents = [];
    current_workspace_documents = {};
  });

  it("groups personal documents separately from shared workspaces and direct shares", () => {
    // Arrange
    current_workspaces = [
      { id: "ws-personal", kind: "personal", name: "Personal" },
      { id: "ws-shared", kind: "shared", name: "Team Space" },
    ];
    current_workspace_documents = {
      "ws-personal": [{ id: "doc-personal", title: "Private notes", workspace_id: "ws-personal" }],
      "ws-shared": [{ id: "doc-shared", title: "Team brief", workspace_id: "ws-shared" }],
    };
    current_shared_documents = [
      { id: "doc-direct", title: "Shared by email", workspace_id: "ws-shared" },
    ];

    // Act
    render(<DocumentList />);

    // Assert
    expect(screen.getByRole("heading", { name: /personal workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /shared workspaces/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /directly shared documents/i })).toBeInTheDocument();
    expect(screen.getByText("Private notes")).toBeInTheDocument();
    expect(screen.getByText("Team brief")).toBeInTheDocument();
    expect(screen.getByText("Shared by email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to workspace/i })).toBeInTheDocument();
  });

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
});
