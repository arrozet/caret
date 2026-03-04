import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { use_documents } from "./use_documents";
import { use_document } from "./use_document";

/**
 * Unit tests for document query hooks.
 * API calls are mocked at the module level via vi.mock.
 */

/* ── mock the API layer ─────────────────────────────── */

vi.mock("../api/document_api", () => ({
  list_documents: vi.fn(),
  get_document: vi.fn(),
  update_document: vi.fn(),
  create_document: vi.fn(),
  delete_document: vi.fn(),
  create_workspace: vi.fn(),
  list_workspaces: vi.fn(),
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
  const query_client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={query_client}>
        {children}
      </QueryClientProvider>
    );
  }

  return Wrapper;
}

/* ── tests ──────────────────────────────────────────── */

describe("use_documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches documents when workspace_id is provided", async () => {
    const { list_documents } = await import("../api/document_api");
    vi.mocked(list_documents).mockResolvedValue([MOCK_DOC]);

    const { result } = renderHook(
      () => use_documents("ws-1"),
      { wrapper: create_wrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].title).toBe("Test Doc");
    expect(list_documents).toHaveBeenCalledWith("ws-1");
  });

  it("does not fetch when workspace_id is undefined", () => {
    const { result } = renderHook(
      () => use_documents(undefined),
      { wrapper: create_wrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("use_document", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a single document by ID", async () => {
    const { get_document } = await import("../api/document_api");
    vi.mocked(get_document).mockResolvedValue(MOCK_DOC);

    const { result } = renderHook(
      () => use_document("doc-1"),
      { wrapper: create_wrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("doc-1");
    expect(get_document).toHaveBeenCalledWith("doc-1");
  });

  it("does not fetch when document_id is undefined", () => {
    const { result } = renderHook(
      () => use_document(undefined),
      { wrapper: create_wrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
  });
});
