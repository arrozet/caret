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
  findById: ReturnType<typeof vi.fn>;
  listByWorkspace: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  softDelete: ReturnType<typeof vi.fn>;
};

type MockDocumentMemberRepo = {
  findMembership: ReturnType<typeof vi.fn>;
  addMember: ReturnType<typeof vi.fn>;
  listByUser: ReturnType<typeof vi.fn>;
};

type MockVersionRepo = {
  create: ReturnType<typeof vi.fn>;
  findLatest: ReturnType<typeof vi.fn>;
  listByDocument: ReturnType<typeof vi.fn>;
};

type MockWorkspaceRepo = {
  findById: ReturnType<typeof vi.fn>;
  findMembership: ReturnType<typeof vi.fn>;
  findAuthUserIdByEmail: ReturnType<typeof vi.fn>;
  findFolderById: ReturnType<typeof vi.fn>;
};

/* ── fixtures ───────────────────────────────────────── */

const USER_ID = "user-abc-123";
const WORKSPACE_ID = "ws-def-456";
const DOCUMENT_ID = "doc-ghi-789";
const INVITED_USER_ID = "user-invited-999";

/** Build a fake workspace row matching the shape the service expects. */
function make_workspace(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKSPACE_ID,
    slug: "my-project",
    name: "My Project",
    created_by_user_id: USER_ID,
    settings: { kind: "shared" },
    created_at: new Date("2025-01-01T00:00:00Z"),
    updated_at: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

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

/** Build a fake shared document row. */
function make_shared_doc(overrides: Record<string, unknown> = {}) {
  return make_doc({ visibility: "workspace", ...overrides });
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
  let document_member_repo: MockDocumentMemberRepo;
  let version_repo: MockVersionRepo;
  let workspace_repo: MockWorkspaceRepo;
  let service: DocumentService;

  beforeEach(() => {
    document_repo = {
      create: vi.fn(),
      findById: vi.fn(),
      listByWorkspace: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };

    document_member_repo = {
      findMembership: vi.fn(),
      addMember: vi.fn(),
      listByUser: vi.fn(),
    };

    version_repo = {
      create: vi.fn(),
      findLatest: vi.fn(),
      listByDocument: vi.fn(),
    };

    workspace_repo = {
      findById: vi.fn(),
      findMembership: vi.fn(),
      findAuthUserIdByEmail: vi.fn(),
      findFolderById: vi.fn(),
    };

    workspace_repo.findById.mockResolvedValue(make_workspace());
    document_member_repo.findMembership.mockResolvedValue(null);
    document_member_repo.listByUser.mockResolvedValue({ data: [], total: 0 });

    /* Cast mocks to satisfy the constructor's type expectations */
    service = new DocumentService(
      document_repo as never,
      document_member_repo as never,
      version_repo as never,
      workspace_repo as never,
    );
  });

  /* ── create_document ─────────────────────────────── */

  describe("create_document", () => {
    it("creates document and initial version when user is a member", async () => {
      workspace_repo.findMembership.mockResolvedValue(make_membership());
      document_repo.create.mockResolvedValue(make_doc());
      version_repo.create.mockResolvedValue(make_version(1));

      const result = await service.create_document(
        { title: "Test Document", workspace_id: WORKSPACE_ID },
        USER_ID,
      );

      expect(workspace_repo.findMembership).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID);
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
      workspace_repo.findMembership.mockResolvedValue(null);

      await expect(
        service.create_document({ title: "Test", workspace_id: WORKSPACE_ID }, USER_ID),
      ).rejects.toThrow(ForbiddenError);

      expect(document_repo.create).not.toHaveBeenCalled();
    });
  });

  /* ── shared_documents ─────────────────────────────── */

  describe("list_shared_documents", () => {
    it("returns documents directly shared with the current user", async () => {
      // Arrange
      document_member_repo.listByUser.mockResolvedValue({
        data: [make_shared_doc({ id: "doc-shared-1" })],
        total: 1,
      });

      // Act
      const result = await service.list_shared_documents(USER_ID, { limit: 50, offset: 0 });

      // Assert
      expect(document_member_repo.listByUser).toHaveBeenCalledWith(USER_ID, {
        limit: 50,
        offset: 0,
      });
      expect(result.data[0].visibility).toBe("workspace");
    });
  });

  /* ── get_document ────────────────────────────────── */

  describe("get_document", () => {
    it("returns document with latest version content", async () => {
      document_repo.findById.mockResolvedValue(make_doc());
      workspace_repo.findMembership.mockResolvedValue(make_membership());
      document_member_repo.findMembership.mockResolvedValue(null);
      version_repo.findLatest.mockResolvedValue(make_version(3));

      const result = await service.get_document(DOCUMENT_ID, USER_ID);

      expect(result.id).toBe(DOCUMENT_ID);
      expect(result.content_json).toEqual({ type: "doc", content: [] });
    });

    it("throws NotFoundError when document does not exist", async () => {
      document_repo.findById.mockResolvedValue(null);

      await expect(service.get_document("nonexistent", USER_ID)).rejects.toThrow(NotFoundError);
    });

    it("throws ForbiddenError when user is not a member of document's workspace", async () => {
      document_repo.findById.mockResolvedValue(make_doc());
      workspace_repo.findMembership.mockResolvedValue(null);
      document_member_repo.findMembership.mockResolvedValue(null);

      await expect(service.get_document(DOCUMENT_ID, USER_ID)).rejects.toThrow(ForbiddenError);
    });

    it("allows access through document membership even without workspace membership", async () => {
      // Arrange
      document_repo.findById.mockResolvedValue(make_doc());
      workspace_repo.findMembership.mockResolvedValue(null);
      document_member_repo.findMembership.mockResolvedValue({
        document_id: DOCUMENT_ID,
        user_id: USER_ID,
        role: "editor",
      });
      version_repo.findLatest.mockResolvedValue(make_version(3));

      // Act
      const result = await service.get_document(DOCUMENT_ID, USER_ID);

      // Assert
      expect(result.id).toBe(DOCUMENT_ID);
    });
  });

  /* ── list_documents ──────────────────────────────── */

  describe("list_documents", () => {
    it("returns all documents in workspace without content", async () => {
      workspace_repo.findMembership.mockResolvedValue(make_membership());
      document_repo.listByWorkspace.mockResolvedValue({
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
      workspace_repo.findMembership.mockResolvedValue(null);

      await expect(
        service.list_documents(WORKSPACE_ID, USER_ID, { limit: 50, offset: 0 }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  /* ── update_document ─────────────────────────────── */

  describe("update_document", () => {
    it("updates title without creating a new version", async () => {
      document_repo.findById.mockResolvedValue(make_doc());
      workspace_repo.findMembership.mockResolvedValue(make_membership());
      document_repo.update.mockResolvedValue(make_doc({ title: "Updated Title" }));

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
      document_repo.findById.mockResolvedValue(make_doc());
      workspace_repo.findMembership.mockResolvedValue(make_membership());
      document_repo.update.mockResolvedValue(make_doc());
      version_repo.findLatest.mockResolvedValue(make_version(2));
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

    it("retries version creation when a concurrent unique conflict occurs", async () => {
      // Arrange
      const new_content = { type: "doc", content: [{ type: "paragraph" }] };
      document_repo.findById.mockResolvedValue(make_doc());
      workspace_repo.findMembership.mockResolvedValue(make_membership());
      document_repo.update.mockResolvedValue(make_doc());
      version_repo.findLatest
        .mockResolvedValueOnce(make_version(2))
        .mockResolvedValueOnce(make_version(3));
      version_repo.create.mockRejectedValueOnce({ code: "23505" }).mockResolvedValueOnce({
        ...make_version(4),
        content_json: new_content,
        content_text: "hello",
      });

      // Act
      const result = await service.update_document(
        DOCUMENT_ID,
        { content_json: new_content, content_text: "hello" },
        USER_ID,
      );

      // Assert
      expect(version_repo.create).toHaveBeenCalledTimes(2);
      expect(result.content_json).toEqual(new_content);
    });

    it("throws NotFoundError when document does not exist", async () => {
      document_repo.findById.mockResolvedValue(null);

      await expect(
        service.update_document("nonexistent", { title: "New" }, USER_ID),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ForbiddenError when user is not a member", async () => {
      document_repo.findById.mockResolvedValue(make_doc());
      workspace_repo.findMembership.mockResolvedValue(null);

      await expect(service.update_document(DOCUMENT_ID, { title: "New" }, USER_ID)).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("moves a document to another workspace and updates visibility", async () => {
      // Arrange
      document_repo.findById.mockResolvedValue(make_doc({ visibility: "private" }));
      workspace_repo.findMembership.mockResolvedValue(make_membership());
      workspace_repo.findById.mockResolvedValue({
        ...make_workspace({ id: "ws-new" }),
        settings: { kind: "shared" },
      });
      document_repo.update.mockResolvedValue(make_doc({ workspace_id: "ws-new" }));

      // Act
      const result = await service.update_document(
        DOCUMENT_ID,
        { workspace_id: "ws-new" },
        USER_ID,
      );

      // Assert
      expect(document_repo.update).toHaveBeenCalledWith(
        DOCUMENT_ID,
        expect.objectContaining({ workspace_id: "ws-new", visibility: "workspace" }),
      );
      expect(result.workspace_id).toBe("ws-new");
    });
  });

  /* ── invite_document_collaborator ───────────────────── */

  describe("invite_document_collaborator", () => {
    it("shares a document directly through document membership", async () => {
      // Arrange
      document_repo.findById.mockResolvedValue(make_doc({ visibility: "workspace" }));
      workspace_repo.findById.mockResolvedValue(make_workspace({ settings: { kind: "shared" } }));
      workspace_repo.findMembership.mockResolvedValue(make_membership());
      workspace_repo.findAuthUserIdByEmail.mockResolvedValue(INVITED_USER_ID);
      document_member_repo.findMembership.mockResolvedValue(null);
      document_member_repo.addMember.mockResolvedValue({
        document_id: DOCUMENT_ID,
        user_id: INVITED_USER_ID,
        role: "editor",
      });

      // Act
      const result = await service.invite_document_collaborator(
        DOCUMENT_ID,
        "invitee@caret.page",
        USER_ID,
      );

      // Assert
      expect(workspace_repo.findAuthUserIdByEmail).toHaveBeenCalledWith("invitee@caret.page");
      expect(document_member_repo.addMember).toHaveBeenCalledWith(
        expect.objectContaining({
          document_id: DOCUMENT_ID,
          user_id: INVITED_USER_ID,
          role: "editor",
          added_by_user_id: USER_ID,
        }),
      );
      expect(result).toEqual({
        document_id: DOCUMENT_ID,
        user_id: INVITED_USER_ID,
        email: "invitee@caret.page",
        role: "editor",
        scope: "document",
      });
    });

    it("returns success when the invited user is already directly shared", async () => {
      // Arrange
      document_repo.findById.mockResolvedValue(make_doc({ visibility: "workspace" }));
      workspace_repo.findById.mockResolvedValue(make_workspace({ settings: { kind: "shared" } }));
      workspace_repo.findMembership.mockResolvedValue(make_membership());
      workspace_repo.findAuthUserIdByEmail.mockResolvedValue(INVITED_USER_ID);
      document_member_repo.findMembership.mockResolvedValue({
        document_id: DOCUMENT_ID,
        user_id: INVITED_USER_ID,
        role: "commenter",
      });

      // Act
      const result = await service.invite_document_collaborator(
        DOCUMENT_ID,
        "invitee@caret.page",
        USER_ID,
      );

      // Assert
      expect(document_member_repo.addMember).not.toHaveBeenCalled();
      expect(result.scope).toBe("document");
      expect(result.role).toBe("commenter");
    });

    it("throws ForbiddenError when the document lives in a personal workspace", async () => {
      // Arrange
      document_repo.findById.mockResolvedValue(make_doc());
      workspace_repo.findById.mockResolvedValue(make_workspace({ settings: { kind: "personal" } }));

      // Act & Assert
      await expect(
        service.invite_document_collaborator(DOCUMENT_ID, "invitee@caret.page", USER_ID),
      ).rejects.toThrow(ForbiddenError);
    });

    it("throws NotFoundError when the document does not exist", async () => {
      // Arrange
      document_repo.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.invite_document_collaborator(DOCUMENT_ID, "invitee@caret.page", USER_ID),
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ForbiddenError when inviter is not in the workspace", async () => {
      // Arrange
      document_repo.findById.mockResolvedValue(make_doc());
      workspace_repo.findById.mockResolvedValue(make_workspace({ settings: { kind: "shared" } }));
      workspace_repo.findMembership.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.invite_document_collaborator(DOCUMENT_ID, "invitee@caret.page", USER_ID),
      ).rejects.toThrow(ForbiddenError);
    });

    it("throws NotFoundError when invited email does not exist in Caret", async () => {
      // Arrange
      document_repo.findById.mockResolvedValue(make_doc());
      workspace_repo.findById.mockResolvedValue(make_workspace({ settings: { kind: "shared" } }));
      workspace_repo.findMembership.mockResolvedValue(make_membership());
      workspace_repo.findAuthUserIdByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.invite_document_collaborator(DOCUMENT_ID, "missing@caret.page", USER_ID),
      ).rejects.toThrow(NotFoundError);
      expect(document_member_repo.addMember).not.toHaveBeenCalled();
    });
  });

  /* ── delete_document ─────────────────────────────── */

  describe("delete_document", () => {
    it("soft-deletes the document", async () => {
      document_repo.findById.mockResolvedValue(make_doc());
      workspace_repo.findMembership.mockResolvedValue(make_membership());
      document_repo.softDelete.mockResolvedValue(make_doc());

      await service.delete_document(DOCUMENT_ID, USER_ID);

      expect(document_repo.softDelete).toHaveBeenCalledWith(DOCUMENT_ID, USER_ID);
    });

    it("throws NotFoundError when document does not exist", async () => {
      document_repo.findById.mockResolvedValue(null);

      await expect(service.delete_document("nonexistent", USER_ID)).rejects.toThrow(NotFoundError);
    });

    it("throws ForbiddenError when user is not a member", async () => {
      document_repo.findById.mockResolvedValue(make_doc());
      workspace_repo.findMembership.mockResolvedValue(null);

      await expect(service.delete_document(DOCUMENT_ID, USER_ID)).rejects.toThrow(ForbiddenError);
    });
  });
});
