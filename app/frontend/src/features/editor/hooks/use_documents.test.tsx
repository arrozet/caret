// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDocuments } from "./useDocuments";
import { useSharedDocuments } from "./useSharedDocuments";
import { useDocument } from "./useDocument";
import { useCreateDocument } from "./useCreateDocument";
import { useMoveDocument } from "./useMoveDocument";

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
    (listDocuments as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue([
      MOCK_DOC,
    ]);

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
    (listSharedDocuments as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue([
      MOCK_DOC,
    ]);

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
    (getDocument as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue(MOCK_DOC);

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
});

describe("useMoveDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves a document and refreshes dependent lists", async () => {
    const { updateDocument } = await import("../api/documentApi");
    const moved_doc = { ...MOCK_DOC, workspace_id: "ws-2" };
    vi.mocked(updateDocument).mockResolvedValue(moved_doc);

    const query_client = create_query_client();
    const invalidate_spy = vi.spyOn(query_client, "invalidateQueries");
    const set_query_data_spy = vi.spyOn(query_client, "setQueryData");
    const { result } = renderHook(() => useMoveDocument(), {
      wrapper: create_wrapper_with_client(query_client),
    });

    await result.current.mutateAsync({ documentId: "doc-1", workspaceId: "ws-2" });

    expect(updateDocument).toHaveBeenCalledWith("doc-1", {
      workspace_id: "ws-2",
      folder_id: null,
    });
    expect(set_query_data_spy).toHaveBeenCalledWith(["document", "doc-1"], moved_doc);
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["documents"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["shared-documents"] });
    expect(invalidate_spy).toHaveBeenCalledWith({ queryKey: ["workspaces"] });
  });
});
