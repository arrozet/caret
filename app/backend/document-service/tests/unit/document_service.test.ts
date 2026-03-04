import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocumentService } from "../../src/services/document_service.js";
import { NotFoundError, ForbiddenError } from "../../src/lib/errors.js";

/**
 * Unit tests for DocumentService.
 * All repository dependencies are mocked — no database required.
 * Tests validate authorization enforcement, delegation to repos,
 * and DTO mapping.
 */

/* ── types for mocks ────────────────────────────────── */

type MockDocumentRepo = {
  create: ReturnType<typeof vi.fn>;
  find_by_id: ReturnType<typeof vi.fn>;
  list_by_workspace: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  soft_delete: ReturnType<typeof vi.fn>;
};

type MockVersionRepo = {
  create: ReturnType<typeof vi.fn>;
  find_latest: ReturnType<typeof vi.fn>;
  list_by_document: ReturnType<typeof vi.fn>;
};

type MockWorkspaceRepo = {
  find_membership: ReturnType<typeof vi.fn>;
};

/* ── fixtures ───────────────────────────────────────── */

const USER_ID = "user-abc-123";
const WORKSPACE_ID = "ws-def-456";
const DOCUMENT_ID = "doc-ghi-789";

/** Build a fake document row matching the shape the service expects. */
function make_doc(overrides: Record<string, unknown> = {}) {
  return {
    id: DOCUMENT_ID,
    workspace_id: WORKSPACE_ID,
    folder_id: null,
    title: "Test Document",
    status: "active",
    visibility: "private",
    owner_user_id: USER_ID,
    created_at: new Date("2025-01-01T00:00:00Z"),
    updated_at: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** Build a fake membership row. */
function make_membership() {
  return {
    workspace_id: WORKSPACE_ID,
    user_id: USER_ID,
    role: "owner",
  };
}

/** Build a fake version row. */
function make_version(version_number: number) {
  return {
    id: `ver-${version_number}`,
    document_id: DOCUMENT_ID,
    version_number,
    source: "manual",
    content_json: { type: "doc", content: [] },
    content_text: "",
    created_by_user_id: USER_ID,
    created_at: new Date("2025-01-01T00:00:00Z"),
  };
}

/* ── tests ──────────────────────────────────────────── */

describe("DocumentService", () => {
  let document_repo: MockDocumentRepo;
  let version_repo: MockVersionRepo;
  let workspace_repo: MockWorkspaceRepo;
  let service: DocumentService;

  beforeEach(() => {
    document_repo = {
      create: vi.fn(),
      find_by_id: vi.fn(),
      list_by_workspace: vi.fn(),
      update: vi.fn(),
      soft_delete: vi.fn(),
    };

    version_repo = {
      create: vi.fn(),
      find_latest: vi.fn(),
      list_by_document: vi.fn(),
    };

    workspace_repo = {
      find_membership: vi.fn(),
    };

    /* Cast mocks to satisfy the constructor's type expectations */
    service = new DocumentService(
      document_repo as never,
      version_repo as never,
      workspace_repo as never,
    );
  });

  /* ── create_document ─────────────────────────────── */

  describe("create_document", () => {
    it("creates document and initial version when user is a member", async () => {
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      document_repo.create.mockResolvedValue(make_doc());
      version_repo.create.mockResolvedValue(make_version(1));

      const result = await service.create_document(
        { title: "Test Document", workspace_id: WORKSPACE_ID },
        USER_ID,
      );

      expect(workspace_repo.find_membership).toHaveBeenCalledWith(
        WORKSPACE_ID,
        USER_ID,
      );
      expect(document_repo.create).toHaveBeenCalledOnce();
      expect(version_repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          document_id: DOCUMENT_ID,
          version_number: 1,
          source: "manual",
          content_text: "",
        }),
      );
      expect(result.id).toBe(DOCUMENT_ID);
      expect(result.title).toBe("Test Document");
      expect(result.created_at).toBe("2025-01-01T00:00:00.000Z");
    });

    it("throws ForbiddenError when user is not a workspace member", async () => {
      workspace_repo.find_membership.mockResolvedValue(null);

      await expect(
        service.create_document(
          { title: "Test", workspace_id: WORKSPACE_ID },
          USER_ID,
        ),
      ).rejects.toThrow(ForbiddenError);

      expect(document_repo.create).not.toHaveBeenCalled();
    });
  });

  /* ── get_document ────────────────────────────────── */

  describe("get_document", () => {
    it("returns document with latest version content", async () => {
      document_repo.find_by_id.mockResolvedValue(make_doc());
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      version_repo.find_latest.mockResolvedValue(
        make_version(3),
      );

      const result = await service.get_document(DOCUMENT_ID, USER_ID);

      expect(result.id).toBe(DOCUMENT_ID);
      expect(result.content_json).toEqual({ type: "doc", content: [] });
    });

    it("throws NotFoundError when document does not exist", async () => {
      document_repo.find_by_id.mockResolvedValue(null);

      await expect(
        service.get_document("nonexistent", USER_ID),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ForbiddenError when user is not a member of document's workspace", async () => {
      document_repo.find_by_id.mockResolvedValue(make_doc());
      workspace_repo.find_membership.mockResolvedValue(null);

      await expect(
        service.get_document(DOCUMENT_ID, USER_ID),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  /* ── list_documents ──────────────────────────────── */

  describe("list_documents", () => {
    it("returns all documents in workspace without content", async () => {
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      document_repo.list_by_workspace.mockResolvedValue({
        data: [
          make_doc({ id: "doc-1", title: "First" }),
          make_doc({ id: "doc-2", title: "Second" }),
        ],
        total: 2,
      });

      const result = await service.list_documents(WORKSPACE_ID, USER_ID, { limit: 50, offset: 0 });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].title).toBe("First");
      expect(result.data[1].title).toBe("Second");
      /* Content should not be included in list responses */
      expect(result.data[0].content_json).toBeUndefined();
      /* Pagination envelope */
      expect(result.pagination).toEqual({ total: 2, limit: 50, offset: 0 });
    });

    it("throws ForbiddenError when user is not a member", async () => {
      workspace_repo.find_membership.mockResolvedValue(null);

      await expect(
        service.list_documents(WORKSPACE_ID, USER_ID, { limit: 50, offset: 0 }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  /* ── update_document ─────────────────────────────── */

  describe("update_document", () => {
    it("updates title without creating a new version", async () => {
      document_repo.find_by_id.mockResolvedValue(make_doc());
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      document_repo.update.mockResolvedValue(
        make_doc({ title: "Updated Title" }),
      );

      const result = await service.update_document(
        DOCUMENT_ID,
        { title: "Updated Title" },
        USER_ID,
      );

      expect(result.title).toBe("Updated Title");
      expect(version_repo.create).not.toHaveBeenCalled();
    });

    it("creates a new version when content_json is provided", async () => {
      const new_content = { type: "doc", content: [{ type: "paragraph" }] };
      document_repo.find_by_id.mockResolvedValue(make_doc());
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      document_repo.update.mockResolvedValue(make_doc());
      version_repo.find_latest.mockResolvedValue(make_version(2));
      version_repo.create.mockResolvedValue({
        ...make_version(3),
        content_json: new_content,
        content_text: "hello",
      });

      const result = await service.update_document(
        DOCUMENT_ID,
        { content_json: new_content, content_text: "hello" },
        USER_ID,
      );

      expect(version_repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          document_id: DOCUMENT_ID,
          version_number: 3,
          source: "autosnapshot",
        }),
      );
      expect(result.content_json).toEqual(new_content);
    });

    it("throws NotFoundError when document does not exist", async () => {
      document_repo.find_by_id.mockResolvedValue(null);

      await expect(
        service.update_document(
          "nonexistent",
          { title: "New" },
          USER_ID,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ForbiddenError when user is not a member", async () => {
      document_repo.find_by_id.mockResolvedValue(make_doc());
      workspace_repo.find_membership.mockResolvedValue(null);

      await expect(
        service.update_document(
          DOCUMENT_ID,
          { title: "New" },
          USER_ID,
        ),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  /* ── delete_document ─────────────────────────────── */

  describe("delete_document", () => {
    it("soft-deletes the document", async () => {
      document_repo.find_by_id.mockResolvedValue(make_doc());
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      document_repo.soft_delete.mockResolvedValue(make_doc());

      await service.delete_document(DOCUMENT_ID, USER_ID);

      expect(document_repo.soft_delete).toHaveBeenCalledWith(
        DOCUMENT_ID,
        USER_ID,
      );
    });

    it("throws NotFoundError when document does not exist", async () => {
      document_repo.find_by_id.mockResolvedValue(null);

      await expect(
        service.delete_document("nonexistent", USER_ID),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ForbiddenError when user is not a member", async () => {
      document_repo.find_by_id.mockResolvedValue(make_doc());
      workspace_repo.find_membership.mockResolvedValue(null);

      await expect(
        service.delete_document(DOCUMENT_ID, USER_ID),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
