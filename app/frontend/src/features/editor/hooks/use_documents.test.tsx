// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDocuments } from "./useDocuments";
import { useSharedDocuments } from "./useSharedDocuments";
import { useDocument } from "./useDocument";
import { useCreateDocument } from "./useCreateDocument";
import { useDeleteDocument } from "./useDeleteDocument";
import { useDeleteWorkspace } from "./useDeleteWorkspace";
import { useMoveDocument } from "./useMoveDocument";
import { useFolders } from "./useFolders";
import { useCreateFolder } from "./useCreateFolder";
import { useUpdateFolder } from "./useUpdateFolder";
import { useDeleteFolder } from "./useDeleteFolder";

/**
 * Unit tests for document query hooks.
 * API calls are mocked at the module level via vi.mock.
 */

/* ── mock the API layer ─────────────────────────────── */

vi.mock("../api/documentApi", () => ({
  listDocuments: vi.fn(),
  listSharedDocuments: vi.fn(),
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
  createWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  deleteWorkspace: vi.fn(),
  listAllFolders: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

/* ── test helpers ───────────────────────────────────── */

const MOCK_DOC = {
  id: "doc-1",
  workspace_id: "ws-1",
  folder_id: null,
  title: "Test Doc",
  status: "active",
  visibility: "private",
  owner_user_id: "user-1",
  content_json: { type: "doc", content: [] },
  content_text: "",
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

const MOCK_FOLDER = {
  id: "folder-1",
  workspace_id: "ws-1",
  parent_folder_id: null,
  name: "Projects",
  sort_order: null,
  created_by_user_id: "user-1",
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

/**
 * Create a fresh QueryClient and wrapper for each test.
 * Disables retries so test failures surface immediately.
 */
function create_wrapper() {
  return create_wrapper_with_client(
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    }),
  );
}

function create_wrapper_with_client(query_client: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={query_client}>{children}</QueryClientProvider>;
  }

  return Wrapper;
}

function create_query_client() {
  const query_client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return query_client;
}

/* ── tests ──────────────────────────────────────────── */

describe("useDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches documents when workspace_id is provided", async () => {
    const { listDocuments } = await import("../api/documentApi");
    vi.mocked(listDocuments).mockResolvedValue([MOCK_DOC]);

    const { result } = renderHook(() => useDocuments("ws-1"), { wrapper: create_wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].title).toBe("Test Doc");
    expect(listDocuments).toHaveBeenCalledWith("ws-1");
  });

  it("does not fetch when workspace_id is undefined", () => {
    const { result } = renderHook(() => useDocuments(undefined), { wrapper: create_wrapper() });

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useSharedDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches directly shared documents", async () => {
    const { listSharedDocuments } = await import("../api/documentApi");
    vi.mocked(listSharedDocuments).mockResolvedValue([MOCK_DOC]);

    const { result } = renderHook(() => useSharedDocuments(), { wrapper: create_wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(listSharedDocuments).toHaveBeenCalledTimes(1);
  });
});

describe("useDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a single document by ID", async () => {
    const { getDocument } = await import("../api/documentApi");
    vi.mocked(getDocument).mockResolvedValue(MOCK_DOC);

    const { result } = renderHook(() => useDocument("doc-1"), { wrapper: create_wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("doc-1");
    expect(getDocument).toHaveBeenCalledWith("doc-1");
  });

  it("does not fetch when document_id is undefined", () => {
    const { result } = renderHook(() => useDocument(undefined), { wrapper: create_wrapper() });

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useCreateDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an untitled document in the requested workspace", async () => {
    const { createDocument } = await import("../api/documentApi");
    vi.mocked(createDocument).mockResolvedValue(MOCK_DOC);

    const query_client = create_query_client();
    const invalidate_spy = vi.spyOn(query_client, "invalidateQueries");
    const { result } = renderHook(() => useCreateDocument(), {
      wrapper: create_wrapper_with_client(query_client),
    });

    await result.current.mutateAsync("ws-1");

    expect(createDocument).toHaveBeenCalledWith("Untitled", "ws-1");
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["documents", "ws-1"] });
  });

  it("creates an untitled document inside the requested folder", async () => {
    // Arrange
    const { createDocument } = await import("../api/documentApi");
    vi.mocked(createDocument).mockResolvedValue(MOCK_DOC);

    const query_client = create_query_client();
    const invalidate_spy = vi.spyOn(query_client, "invalidateQueries");
    const { result } = renderHook(() => useCreateDocument(), {
      wrapper: create_wrapper_with_client(query_client),
    });

    // Act
    await result.current.mutateAsync({ workspaceId: "ws-1", folderId: "folder-1" });

    // Assert
    expect(createDocument).toHaveBeenCalledWith("Untitled", "ws-1", "folder-1");
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["documents", "ws-1"] });
  });
});

describe("useFolders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches folders for a workspace", async () => {
    // Arrange
    const { listAllFolders } = await import("../api/documentApi");
    vi.mocked(listAllFolders).mockResolvedValue([MOCK_FOLDER]);

    // Act
    const { result } = renderHook(() => useFolders("ws-1"), { wrapper: create_wrapper() });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([MOCK_FOLDER]);
    expect(listAllFolders).toHaveBeenCalledWith("ws-1");
  });
});

describe("useCreateFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a folder and refreshes workspace documents and folders", async () => {
    // Arrange
    const { createFolder } = await import("../api/documentApi");
    vi.mocked(createFolder).mockResolvedValue(MOCK_FOLDER);

    const query_client = create_query_client();
    const invalidate_spy = vi.spyOn(query_client, "invalidateQueries");
    const { result } = renderHook(() => useCreateFolder(), {
      wrapper: create_wrapper_with_client(query_client),
    });

    // Act
    await result.current.mutateAsync({
      workspaceId: "ws-1",
      name: "Projects",
      parentFolderId: null,
    });

    // Assert
    expect(createFolder).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "Projects",
      parentFolderId: null,
    });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["folders", "ws-1"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["documents", "ws-1"] });
  });
});

describe("useUpdateFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates a folder and refreshes workspace documents and folders", async () => {
    // Arrange
    const { updateFolder } = await import("../api/documentApi");
    vi.mocked(updateFolder).mockResolvedValue(MOCK_FOLDER);

    const query_client = create_query_client();
    const invalidate_spy = vi.spyOn(query_client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateFolder(), {
      wrapper: create_wrapper_with_client(query_client),
    });

    // Act
    await result.current.mutateAsync({ folderId: "folder-1", data: { name: "Archive" } });

    // Assert
    expect(updateFolder).toHaveBeenCalledWith("folder-1", { name: "Archive" });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["folders", "ws-1"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["documents", "ws-1"] });
  });
});

describe("useDeleteFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a folder and refreshes workspace documents and folders", async () => {
    // Arrange
    const { deleteFolder } = await import("../api/documentApi");
    vi.mocked(deleteFolder).mockResolvedValue(undefined);

    const query_client = create_query_client();
    query_client.setQueryData(["folders", "ws-1"], [MOCK_FOLDER]);
    const invalidate_spy = vi.spyOn(query_client, "invalidateQueries");
    const remove_spy = vi.spyOn(query_client, "removeQueries");
    const { result } = renderHook(() => useDeleteFolder(), {
      wrapper: create_wrapper_with_client(query_client),
    });

    // Act
    await result.current.mutateAsync({
      folderId: "folder-1",
      workspaceId: "ws-1",
      documentIds: [],
    });

    // Assert
    expect(deleteFolder).toHaveBeenCalledWith("folder-1");
    expect(remove_spy).toHaveBeenCalledWith({ queryKey: ["folders", "ws-1"], exact: true });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["folders", "ws-1"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["documents", "ws-1"] });
  });

  it("deletes a folder and removes known ids while preserving other same-workspace detail caches", async () => {
    // Arrange
    const { deleteFolder } = await import("../api/documentApi");
    vi.mocked(deleteFolder).mockResolvedValue(undefined);

    const query_client = create_query_client();
    query_client.setQueryData(["document", "doc-1"], MOCK_DOC);
    query_client.setQueryData(["document", "doc-2"], {
      ...MOCK_DOC,
      id: "doc-2",
      folder_id: "folder-2",
    });
    const invalidate_spy = vi.spyOn(query_client, "invalidateQueries");
    const remove_spy = vi.spyOn(query_client, "removeQueries");
    const { result } = renderHook(() => useDeleteFolder(), {
      wrapper: create_wrapper_with_client(query_client),
    });

    // Act
    await result.current.mutateAsync({
      folderId: "folder-1",
      workspaceId: "ws-1",
      documentIds: ["doc-1"],
    });

    // Assert
    expect(remove_spy).toHaveBeenCalledWith({ queryKey: ["document", "doc-1"], exact: true });
    expect(query_client.getQueryData(["document", "doc-1"])).toBeUndefined();
    expect(query_client.getQueryData(["document", "doc-2"])).toEqual({
      ...MOCK_DOC,
      id: "doc-2",
      folder_id: "folder-2",
    });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["document", "doc-2"] });
    expect(invalidate_spy).not.toHaveBeenCalledWith({ queryKey: ["document"] });
  });

  it("deletes a folder and defensively clears same-workspace document caches when ids are incomplete", async () => {
    // Arrange
    const { deleteFolder } = await import("../api/documentApi");
    vi.mocked(deleteFolder).mockResolvedValue(undefined);

    const query_client = create_query_client();
    query_client.setQueryData(["document", "doc-1"], MOCK_DOC);
    query_client.setQueryData(["document", "doc-2"], {
      ...MOCK_DOC,
      id: "doc-2",
      workspace_id: "ws-1",
      folder_id: "folder-2",
    });
    query_client.setQueryData(["document", "doc-3"], {
      ...MOCK_DOC,
      id: "doc-3",
      workspace_id: "ws-2",
      folder_id: "folder-9",
    });
    const { result } = renderHook(() => useDeleteFolder(), {
      wrapper: create_wrapper_with_client(query_client),
    });

    // Act
    await result.current.mutateAsync({
      folderId: "folder-1",
      workspaceId: "ws-1",
      documentIds: ["doc-1"],
    });

    // Assert
    expect(query_client.getQueryData(["document", "doc-1"])).toBeUndefined();
    expect(query_client.getQueryData(["document", "doc-2"])).toEqual({
      ...MOCK_DOC,
      id: "doc-2",
      workspace_id: "ws-1",
      folder_id: "folder-2",
    });
    expect(query_client.getQueryData(["document", "doc-3"])).toEqual({
      ...MOCK_DOC,
      id: "doc-3",
      workspace_id: "ws-2",
      folder_id: "folder-9",
    });
    expect(query_client.getQueryState(["document", "doc-2"])?.isInvalidated).toBe(true);
    expect(query_client.getQueryState(["document", "doc-3"])?.isInvalidated).not.toBe(true);
  });
});

describe("useMoveDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves a document and refreshes dependent lists", async () => {
    const { updateDocument } = await import("../api/documentApi");
    const moved_doc = { ...MOCK_DOC, workspace_id: "ws-2", folder_id: "folder-2" };
    vi.mocked(updateDocument).mockResolvedValue(moved_doc);

    const query_client = create_query_client();
    const invalidate_spy = vi.spyOn(query_client, "invalidateQueries");
    const set_query_data_spy = vi.spyOn(query_client, "setQueryData");
    const { result } = renderHook(() => useMoveDocument(), {
      wrapper: create_wrapper_with_client(query_client),
    });

    await result.current.mutateAsync({
      documentId: "doc-1",
      workspaceId: "ws-2",
      folderId: "folder-2",
    });

    expect(updateDocument).toHaveBeenCalledWith("doc-1", {
      workspace_id: "ws-2",
      folder_id: "folder-2",
    });
    expect(set_query_data_spy).toHaveBeenCalledWith(["document", "doc-1"], moved_doc);
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["documents"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["shared-documents"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["workspaces"] });
  });
});

describe("useDeleteWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a workspace and clears dependent caches", async () => {
    // Arrange
    const { deleteWorkspace } = await import("../api/documentApi");
    vi.mocked(deleteWorkspace).mockResolvedValue(undefined);

    const query_client = create_query_client();
    query_client.setQueryData(["documents", "ws-1"], [MOCK_DOC]);
    query_client.setQueryData(["shared-documents"], [MOCK_DOC]);
    query_client.setQueryData(["document", "doc-1"], MOCK_DOC);

    const invalidate_spy = vi.spyOn(query_client, "invalidateQueries");
    const remove_spy = vi.spyOn(query_client, "removeQueries");
    const { result } = renderHook(() => useDeleteWorkspace(), {
      wrapper: create_wrapper_with_client(query_client),
    });

    // Act
    await result.current.mutateAsync("ws-1");

    // Assert
    expect(deleteWorkspace).toHaveBeenCalledWith("ws-1");
    expect(remove_spy).toHaveBeenCalledWith({ queryKey: ["documents", "ws-1"], exact: true });
    expect(remove_spy).toHaveBeenCalledWith({ queryKey: ["document"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["workspaces"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["documents"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["shared-documents"] });
  });
});

describe("useDeleteDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a document and clears its detail cache", async () => {
    // Arrange
    const { deleteDocument } = await import("../api/documentApi");
    vi.mocked(deleteDocument).mockResolvedValue(undefined);

    const query_client = create_query_client();
    query_client.setQueryData(["document", "doc-1"], MOCK_DOC);

    const invalidate_spy = vi.spyOn(query_client, "invalidateQueries");
    const remove_spy = vi.spyOn(query_client, "removeQueries");
    const { result } = renderHook(() => useDeleteDocument(), {
      wrapper: create_wrapper_with_client(query_client),
    });

    // Act
    await result.current.mutateAsync("doc-1");

    // Assert
    expect(deleteDocument).toHaveBeenCalledWith("doc-1");
    expect(remove_spy).toHaveBeenCalledWith({ queryKey: ["document", "doc-1"], exact: true });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["documents"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["document"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["shared-documents"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["workspaces"] });
  });
});
