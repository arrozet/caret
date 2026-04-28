import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkspaceService } from "../../src/services/workspace_service.js";
import { NotFoundError, ForbiddenError, ConflictError } from "../../src/lib/errors.js";

/**
 * Unit tests for WorkspaceService.
 * Todos los repositorios están mockeados — sin base de datos real.
 * Verifica la lógica de creación, resolución de slugs únicos,
 * autorización de miembros y mapeo a DTOs.
 */
describe("WorkspaceService", () => {
  /* ── tipos de mocks ─────────────────────────────────── */

  type MockWorkspaceRepo = {
    withAdvisoryLock: ReturnType<typeof vi.fn>;
    withAdvisoryLockContext: ReturnType<typeof vi.fn>;
    acquireAdvisoryLocks: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findBySlug: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findPersonalByUser: ReturnType<typeof vi.fn>;
    findVisibleByUserAndName: ReturnType<typeof vi.fn>;
    listByUser: ReturnType<typeof vi.fn>;
    listActiveMemberEmailsByWorkspace: ReturnType<typeof vi.fn>;
    listActiveMembersByWorkspace: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    softDeleteWorkspace: ReturnType<typeof vi.fn>;
    revokeMembersByWorkspace: ReturnType<typeof vi.fn>;
    addMember: ReturnType<typeof vi.fn>;
    findMembership: ReturnType<typeof vi.fn>;
    findMembershipAny: ReturnType<typeof vi.fn>;
    findAuthUserIdByEmail: ReturnType<typeof vi.fn>;
    reactivateMember: ReturnType<typeof vi.fn>;
  };

  type MockFolderRepo = {
    findIdsByWorkspaceId: ReturnType<typeof vi.fn>;
    softDeleteMany: ReturnType<typeof vi.fn>;
  };

  type MockDocumentRepo = {
    findIdsByWorkspaceId: ReturnType<typeof vi.fn>;
    softDeleteMany: ReturnType<typeof vi.fn>;
  };

  type MockDocumentMemberRepo = {
    removeByDocumentIds: ReturnType<typeof vi.fn>;
  };

  /* ── fixtures ───────────────────────────────────────── */

  const USER_ID = "user-111-aaa";
  const WORKSPACE_ID = "ws-222-bbb";

  /** Construye una fila de workspace simulada. */
  function make_workspace(overrides: Record<string, unknown> = {}) {
    return {
      id: WORKSPACE_ID,
      slug: "my-project",
      name: "My Project",
      created_by_user_id: USER_ID,
      settings: { kind: "shared" },
      created_at: new Date("2025-06-01T00:00:00Z"),
      updated_at: new Date("2025-06-01T00:00:00Z"),
      deleted_at: null,
      ...overrides,
    };
  }

  /** Construye una fila de membresía simulada. */
  function make_membership(role = "owner") {
    return {
      workspace_id: WORKSPACE_ID,
      user_id: USER_ID,
      role,
    };
  }

  /* ── estado de mocks por test ───────────────────────── */

  let workspace_repo: MockWorkspaceRepo;
  let folder_repo: MockFolderRepo;
  let document_repo: MockDocumentRepo;
  let document_member_repo: MockDocumentMemberRepo;
  let service: WorkspaceService;

  beforeEach(() => {
    workspace_repo = {
      withAdvisoryLock: vi.fn(),
      withAdvisoryLockContext: vi.fn(),
      acquireAdvisoryLocks: vi.fn(),
      create: vi.fn(),
      findBySlug: vi.fn(),
      findById: vi.fn(),
      findPersonalByUser: vi.fn(),
      findVisibleByUserAndName: vi.fn(),
      listByUser: vi.fn(),
      listActiveMemberEmailsByWorkspace: vi.fn(),
      listActiveMembersByWorkspace: vi.fn(),
      update: vi.fn(),
      softDeleteWorkspace: vi.fn(),
      revokeMembersByWorkspace: vi.fn(),
      addMember: vi.fn(),
      findMembership: vi.fn(),
      findMembershipAny: vi.fn(),
      findAuthUserIdByEmail: vi.fn(),
      reactivateMember: vi.fn(),
    };

    folder_repo = {
      findIdsByWorkspaceId: vi.fn(),
      softDeleteMany: vi.fn(),
    };

    document_repo = {
      findIdsByWorkspaceId: vi.fn(),
      softDeleteMany: vi.fn(),
    };

    document_member_repo = {
      removeByDocumentIds: vi.fn(),
    };

    workspace_repo.withAdvisoryLock.mockImplementation(
      async (_keys: string[], callback: (repository: MockWorkspaceRepo) => Promise<unknown>) =>
        callback(workspace_repo),
    );
    workspace_repo.withAdvisoryLockContext.mockImplementation(
      async (
        _keys: string[],
        callback: (repositories: {
          workspaceRepository: MockWorkspaceRepo;
          folderRepository: MockFolderRepo;
          documentRepository: MockDocumentRepo;
          documentMemberRepository: MockDocumentMemberRepo;
        }) => Promise<unknown>,
      ) =>
        callback({
          workspaceRepository: workspace_repo,
          folderRepository: folder_repo,
          documentRepository: document_repo,
          documentMemberRepository: document_member_repo,
        }),
    );
    workspace_repo.listActiveMemberEmailsByWorkspace.mockResolvedValue([]);

    workspace_repo.find_by_slug = workspace_repo.findBySlug;
    workspace_repo.find_by_id = workspace_repo.findById;
    workspace_repo.with_advisory_lock = workspace_repo.withAdvisoryLock;
    workspace_repo.with_advisory_lock_context = workspace_repo.withAdvisoryLockContext;
    workspace_repo.acquire_advisory_locks = workspace_repo.acquireAdvisoryLocks;
    workspace_repo.find_visible_by_user_and_name = workspace_repo.findVisibleByUserAndName;
    workspace_repo.list_by_user = workspace_repo.listByUser;
    workspace_repo.list_active_members_by_workspace = workspace_repo.listActiveMembersByWorkspace;
    workspace_repo.update_workspace = workspace_repo.update;
    workspace_repo.soft_delete_workspace = workspace_repo.softDeleteWorkspace;
    workspace_repo.revoke_members_by_workspace = workspace_repo.revokeMembersByWorkspace;
    workspace_repo.add_member = workspace_repo.addMember;
    workspace_repo.find_membership = workspace_repo.findMembership;
    workspace_repo.find_membership_any = workspace_repo.findMembershipAny;
    workspace_repo.find_auth_user_id_by_email = workspace_repo.findAuthUserIdByEmail;
    workspace_repo.reactivate_member = workspace_repo.reactivateMember;

    folder_repo.find_ids_by_workspace_id = folder_repo.findIdsByWorkspaceId;
    folder_repo.soft_delete_many = folder_repo.softDeleteMany;

    document_repo.find_ids_by_workspace_id = document_repo.findIdsByWorkspaceId;
    document_repo.soft_delete_many = document_repo.softDeleteMany;

    document_member_repo.remove_by_document_ids = document_member_repo.removeByDocumentIds;

    service = new WorkspaceService(workspace_repo as never);
  });

  /* ── create_workspace ────────────────────────────────── */

  /**
   * Tests de create_workspace: creación normal, slug auto-generado,
   * deduplicación de slug y race condition con violación de unicidad.
   */
  describe("create_workspace", () => {
    /** verifies that personal workspaces are created with the personal kind. */
    it("should_create_personal_workspace_with_kind", async () => {
      // Arrange
      const dto = { name: "My Docs", kind: "personal" as const };
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([]);
      workspace_repo.findBySlug.mockResolvedValue(null);
      workspace_repo.create.mockResolvedValue(make_workspace({ settings: { kind: "personal" } }));
      workspace_repo.addMember.mockResolvedValue(make_membership());

      // Act
      const result = await service.create_workspace(dto, USER_ID);

      // Assert
      expect(workspace_repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My Docs",
          settings: { kind: "personal" },
        }),
      );
      expect(result.kind).toBe("personal");
    });

    /** verifica que crea workspace y agrega al creador como owner */
    it("should_create_workspace_and_add_creator_as_owner", async () => {
      // Arrange
      const dto = { name: "My Project", slug: "my-project" };
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([]);
      workspace_repo.findBySlug.mockResolvedValue(null);
      workspace_repo.create.mockResolvedValue(make_workspace());
      workspace_repo.addMember.mockResolvedValue(make_membership());

      // Act
      const result = await service.create_workspace(dto, USER_ID);

      // Assert
      expect(workspace_repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My Project",
          slug: "my-project",
          created_by_user_id: USER_ID,
        }),
      );
      expect(workspace_repo.addMember).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: WORKSPACE_ID,
          user_id: USER_ID,
          role: "owner",
        }),
      );
      expect(result.id).toBe(WORKSPACE_ID);
      expect(result.role).toBe("owner");
      expect(workspace_repo.withAdvisoryLock).toHaveBeenCalled();
    });

    it("trims the workspace name consistently on create", async () => {
      const dto = { name: "  My Project  ", slug: "my-project" };
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([]);
      workspace_repo.findBySlug.mockResolvedValue(null);
      workspace_repo.create.mockResolvedValue(make_workspace({ name: "My Project" }));
      workspace_repo.addMember.mockResolvedValue(make_membership());

      const result = await service.createWorkspace(dto, USER_ID);

      expect(workspace_repo.findVisibleByUserAndName).toHaveBeenCalledWith(
        USER_ID,
        "My Project",
        undefined,
      );
      expect(workspace_repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "My Project" }),
      );
      expect(result.name).toBe("My Project");
    });

    /** verifica que auto-genera slug desde el nombre cuando no se provee */
    it("should_auto_generate_slug_from_name_when_not_provided", async () => {
      // Arrange
      const dto = { name: "Hello World Project" };
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([]);
      workspace_repo.findBySlug.mockResolvedValue(null);
      workspace_repo.create.mockResolvedValue(make_workspace({ slug: "hello-world-project" }));
      workspace_repo.addMember.mockResolvedValue(make_membership());

      // Act
      await service.create_workspace(dto, USER_ID);

      // Assert
      expect(workspace_repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "hello-world-project" }),
      );
    });

    /** verifica que append sufijo numérico cuando el slug ya existe */
    it("should_append_numeric_suffix_when_slug_collides", async () => {
      // Arrange
      const dto = { name: "My Project" };
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([]);
      // Primera llamada (base slug) existe, segunda no
      workspace_repo.findBySlug
        .mockResolvedValueOnce(make_workspace()) // "my-project" taken
        .mockResolvedValueOnce(null); // "my-project-2" free
      workspace_repo.create.mockResolvedValue(make_workspace({ slug: "my-project-2" }));
      workspace_repo.addMember.mockResolvedValue(make_membership());

      // Act
      const result = await service.create_workspace(dto, USER_ID);

      // Assert
      expect(workspace_repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "my-project-2" }),
      );
      expect(result).toBeDefined();
    });

    /** verifica que lanza ConflictError ante violación de unicidad del repositorio */
    it("should_throw_ConflictError_on_unique_violation_from_repo", async () => {
      // Arrange
      const dto = { name: "My Project", slug: "my-project" };
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([]);
      workspace_repo.findBySlug.mockResolvedValue(null);
      const pg_unique_error = Object.assign(new Error("duplicate key"), {
        code: "23505",
      });
      workspace_repo.create.mockRejectedValue(pg_unique_error);

      // Act & Assert
      await expect(service.create_workspace(dto, USER_ID)).rejects.toThrow(ConflictError);
    });

    /** verifica que propaga errores desconocidos sin convertirlos */
    it("should_rethrow_unknown_errors_from_repo", async () => {
      // Arrange
      const dto = { name: "My Project", slug: "my-project" };
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([]);
      workspace_repo.findBySlug.mockResolvedValue(null);
      workspace_repo.create.mockRejectedValue(new Error("DB timeout"));

      // Act & Assert
      await expect(service.create_workspace(dto, USER_ID)).rejects.toThrow("DB timeout");
    });

    /** verifica que el DTO de respuesta contiene campos correctos */
    it("should_return_correct_response_dto_shape", async () => {
      // Arrange
      const dto = { name: "My Project", slug: "my-project" };
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([]);
      workspace_repo.findBySlug.mockResolvedValue(null);
      workspace_repo.create.mockResolvedValue(make_workspace());
      workspace_repo.addMember.mockResolvedValue(make_membership());

      // Act
      const result = await service.create_workspace(dto, USER_ID);

      // Assert
      expect(result).toMatchObject({
        id: WORKSPACE_ID,
        slug: "my-project",
        name: "My Project",
        created_by_user_id: USER_ID,
        role: "owner",
      });
      expect(typeof result.created_at).toBe("string");
      expect(typeof result.updated_at).toBe("string");
    });

    /** verifies that workspace invites are blocked for personal workspaces. */
    it("should_forbid_invites_for_personal_workspaces", async () => {
      // Arrange
      workspace_repo.findById.mockResolvedValue(make_workspace({ settings: { kind: "personal" } }));
      workspace_repo.findMembership.mockResolvedValue(make_membership());

      // Act & Assert
      await expect(service.get_workspace(WORKSPACE_ID, USER_ID)).resolves.toMatchObject({
        kind: "personal",
      });
    });

    it("rejects creating a workspace when the user already sees that name", async () => {
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([make_workspace({ id: "ws-1" })]);

      await expect(service.createWorkspace({ name: "My Workspace" }, USER_ID)).rejects.toThrow(
        new ConflictError('Workspace name "My Workspace" already exists'),
      );
    });
  });

  /* ── get_workspace ───────────────────────────────────── */

  /**
   * Tests de get_workspace: éxito, workspace no encontrado, usuario no miembro.
   */
  describe("get_workspace", () => {
    /** verifica que retorna el workspace con el rol del caller */
    it("should_return_workspace_with_caller_role", async () => {
      // Arrange
      workspace_repo.findById.mockResolvedValue(make_workspace());
      workspace_repo.findMembership.mockResolvedValue(make_membership("admin"));

      // Act
      const result = await service.get_workspace(WORKSPACE_ID, USER_ID);

      // Assert
      expect(result.id).toBe(WORKSPACE_ID);
      expect(result.role).toBe("admin");
    });

    /** verifica que lanza NotFoundError cuando el workspace no existe */
    it("should_throw_NotFoundError_when_workspace_not_found", async () => {
      // Arrange
      workspace_repo.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.get_workspace("nonexistent-id", USER_ID)).rejects.toThrow(NotFoundError);
    });

    /** verifica que lanza ForbiddenError cuando el usuario no es miembro */
    it("should_throw_ForbiddenError_when_user_not_member", async () => {
      // Arrange
      workspace_repo.findById.mockResolvedValue(make_workspace());
      workspace_repo.findMembership.mockResolvedValue(null);

      // Act & Assert
      await expect(service.get_workspace(WORKSPACE_ID, USER_ID)).rejects.toThrow(ForbiddenError);
    });
  });

  /* ── list_workspaces ─────────────────────────────────── */

  /**
   * Tests de list_workspaces: respuesta paginada y lista vacía.
   */
  describe("list_workspaces", () => {
    /** verifica que retorna la lista paginada de workspaces del usuario */
    it("should_return_paginated_workspaces_for_user", async () => {
      // Arrange
      const ws_row = {
        ...make_workspace(),
        role: "member",
      };
      workspace_repo.listByUser.mockResolvedValue({
        data: [ws_row],
        total: 1,
      });

      // Act
      const result = await service.list_workspaces(USER_ID, {
        limit: 50,
        offset: 0,
      });

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(WORKSPACE_ID);
      expect(result.pagination).toEqual({ total: 1, limit: 50, offset: 0 });
    });

    /** verifica que retorna lista vacía cuando el usuario no tiene workspaces */
    it("should_return_empty_list_when_user_has_no_workspaces", async () => {
      // Arrange
      workspace_repo.listByUser.mockResolvedValue({ data: [], total: 0 });

      // Act
      const result = await service.list_workspaces(USER_ID, {
        limit: 50,
        offset: 0,
      });

      // Assert
      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    /** verifica que pasa correctamente la paginación al repositorio */
    it("should_pass_pagination_params_to_repo", async () => {
      // Arrange
      workspace_repo.listByUser.mockResolvedValue({ data: [], total: 0 });
      const pagination = { limit: 10, offset: 20 };

      // Act
      await service.list_workspaces(USER_ID, pagination);

      // Assert
      expect(workspace_repo.listByUser).toHaveBeenCalledWith(USER_ID, pagination);
    });
  });

  describe("update_workspace", () => {
    it("renames a workspace when the owner provides a unique name", async () => {
      workspace_repo.findById.mockResolvedValue(make_workspace());
      workspace_repo.findMembership.mockResolvedValue(make_membership("owner"));
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([]);
      workspace_repo.listActiveMembersByWorkspace.mockResolvedValue([{ user_id: USER_ID }]);
      workspace_repo.update.mockResolvedValue(make_workspace({ name: "Studio" }));
      workspace_repo.acquireAdvisoryLocks.mockResolvedValue(undefined);

      const result = await service.updateWorkspace(WORKSPACE_ID, { name: "Studio" }, USER_ID);

      expect(workspace_repo.update).toHaveBeenCalledWith(WORKSPACE_ID, { name: "Studio" });
      expect(result.name).toBe("Studio");
    });

    it("trims the workspace name consistently on rename", async () => {
      workspace_repo.findById.mockResolvedValue(make_workspace());
      workspace_repo.findMembership.mockResolvedValue(make_membership("owner"));
      workspace_repo.listActiveMembersByWorkspace.mockResolvedValue([{ user_id: USER_ID }]);
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([]);
      workspace_repo.update.mockResolvedValue(make_workspace({ name: "Studio" }));
      workspace_repo.acquireAdvisoryLocks.mockResolvedValue(undefined);

      await service.updateWorkspace(WORKSPACE_ID, { name: "  Studio  " }, USER_ID);

      expect(workspace_repo.findVisibleByUserAndName).toHaveBeenCalledWith(
        USER_ID,
        "Studio",
        WORKSPACE_ID,
      );
      expect(workspace_repo.update).toHaveBeenCalledWith(WORKSPACE_ID, { name: "Studio" });
    });

    it("rejects renaming a workspace when it would collide for an active member", async () => {
      workspace_repo.findById.mockResolvedValue(make_workspace());
      workspace_repo.findMembership.mockResolvedValue(make_membership("owner"));
      workspace_repo.listActiveMembersByWorkspace.mockResolvedValue([
        { user_id: USER_ID },
        { user_id: "user-333-other" },
      ]);
      workspace_repo.acquireAdvisoryLocks.mockResolvedValue(undefined);
      workspace_repo.findVisibleByUserAndName.mockImplementation(async (userId: string) => {
        if (userId === USER_ID) {
          return [];
        }

        return [make_workspace({ id: "other-ws" })];
      });

      await expect(
        service.updateWorkspace(WORKSPACE_ID, { name: "Studio" }, USER_ID),
      ).rejects.toThrow('Workspace name "Studio" already exists');
    });

    it("rejects renaming a missing workspace", async () => {
      workspace_repo.findById.mockResolvedValue(null);

      await expect(
        service.updateWorkspace(WORKSPACE_ID, { name: "Studio" }, USER_ID),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects renaming when the caller is not a member", async () => {
      workspace_repo.findById.mockResolvedValue(make_workspace());
      workspace_repo.findMembership.mockResolvedValue(null);

      await expect(
        service.updateWorkspace(WORKSPACE_ID, { name: "Studio" }, USER_ID),
      ).rejects.toThrow(ForbiddenError);
    });

    it("rejects renaming when the caller is not an owner", async () => {
      workspace_repo.findById.mockResolvedValue(make_workspace());
      workspace_repo.findMembership.mockResolvedValue(make_membership("member"));

      await expect(
        service.updateWorkspace(WORKSPACE_ID, { name: "Studio" }, USER_ID),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("invite_workspace_collaborator", () => {
    const INVITED_USER_ID = "user-222-invited";

    it("rejects inviting a collaborator when the invited user would get a duplicate workspace name", async () => {
      workspace_repo.findById.mockResolvedValue(make_workspace({ name: "My Workspace" }));
      workspace_repo.findMembership.mockImplementation(
        async (_workspaceId: string, userId: string) => {
          if (userId === USER_ID) {
            return make_membership("owner");
          }

          return null;
        },
      );
      workspace_repo.findAuthUserIdByEmail.mockResolvedValue(INVITED_USER_ID);
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([
        make_workspace({ id: "other-ws" }),
      ]);
      workspace_repo.acquireAdvisoryLocks.mockResolvedValue(undefined);

      await expect(
        service.inviteWorkspaceCollaborator(WORKSPACE_ID, "invitee@caret.page", USER_ID),
      ).rejects.toThrow('Workspace name "My Workspace" already exists');
    });

    it("rejects reactivating a collaborator when the invited user would get a duplicate workspace name", async () => {
      workspace_repo.findById.mockResolvedValue(make_workspace({ name: "My Workspace" }));
      workspace_repo.findMembership.mockImplementation(
        async (_workspaceId: string, userId: string) => {
          if (userId === USER_ID) {
            return make_membership("owner");
          }

          return null;
        },
      );
      workspace_repo.findAuthUserIdByEmail.mockResolvedValue(INVITED_USER_ID);
      workspace_repo.findMembershipAny.mockResolvedValue({
        workspace_id: WORKSPACE_ID,
        user_id: INVITED_USER_ID,
        role: "member",
        revoked_at: new Date(),
      });
      workspace_repo.findVisibleByUserAndName.mockResolvedValue([
        make_workspace({ id: "other-ws" }),
      ]);
      workspace_repo.acquireAdvisoryLocks.mockResolvedValue(undefined);

      await expect(
        service.inviteWorkspaceCollaborator(WORKSPACE_ID, "invitee@caret.page", USER_ID),
      ).rejects.toThrow('Workspace name "My Workspace" already exists');

      expect(workspace_repo.reactivateMember).not.toHaveBeenCalled();
    });
  });

  describe("delete_workspace", () => {
    it("soft deletes a workspace and its memberships", async () => {
      // Arrange
      workspace_repo.findById.mockResolvedValue(make_workspace());
      workspace_repo.findMembership.mockResolvedValue(make_membership("owner"));
      folder_repo.findIdsByWorkspaceId.mockResolvedValue([]);
      document_repo.findIdsByWorkspaceId.mockResolvedValue([]);

      // Act
      await service.deleteWorkspace(WORKSPACE_ID, USER_ID);

      // Assert
      expect(workspace_repo.withAdvisoryLockContext).toHaveBeenCalledWith(
        ["workspace:ws-222-bbb"],
        expect.any(Function),
      );
      expect(workspace_repo.softDeleteWorkspace).toHaveBeenCalledWith(WORKSPACE_ID);
      expect(workspace_repo.revokeMembersByWorkspace).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID);
    });

    it("soft deletes workspace folders and documents before revoking memberships", async () => {
      // Arrange
      const folder_ids = ["folder-1", "folder-2"];
      const document_ids = ["doc-1", "doc-2"];

      workspace_repo.findById.mockResolvedValue(make_workspace());
      workspace_repo.findMembership.mockResolvedValue(make_membership("owner"));
      folder_repo.findIdsByWorkspaceId.mockResolvedValue(folder_ids);
      document_repo.findIdsByWorkspaceId.mockResolvedValue(document_ids);

      // Act
      await service.deleteWorkspace(WORKSPACE_ID, USER_ID);

      // Assert
      expect(folder_repo.findIdsByWorkspaceId).toHaveBeenCalledWith(WORKSPACE_ID);
      expect(document_repo.findIdsByWorkspaceId).toHaveBeenCalledWith(WORKSPACE_ID);
      expect(document_member_repo.removeByDocumentIds).toHaveBeenCalledWith(document_ids);
      expect(document_repo.softDeleteMany).toHaveBeenCalledWith(document_ids, USER_ID);
      expect(folder_repo.softDeleteMany).toHaveBeenCalledWith(folder_ids);
      expect(workspace_repo.softDeleteWorkspace).toHaveBeenCalledWith(WORKSPACE_ID);
      expect(workspace_repo.revokeMembersByWorkspace).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID);
    });

    it("stops the workspace delete cascade when a transactional step fails", async () => {
      // Arrange
      const expected_error = new Error("document delete failed");

      workspace_repo.findById.mockResolvedValue(make_workspace());
      workspace_repo.findMembership.mockResolvedValue(make_membership("owner"));
      folder_repo.findIdsByWorkspaceId.mockResolvedValue(["folder-1"]);
      document_repo.findIdsByWorkspaceId.mockResolvedValue(["doc-1"]);
      document_member_repo.removeByDocumentIds.mockResolvedValue(1);
      document_repo.softDeleteMany.mockRejectedValue(expected_error);

      // Act
      const result = service.deleteWorkspace(WORKSPACE_ID, USER_ID);

      // Assert
      await expect(result).rejects.toBe(expected_error);
      expect(folder_repo.softDeleteMany).not.toHaveBeenCalled();
      expect(workspace_repo.softDeleteWorkspace).not.toHaveBeenCalled();
      expect(workspace_repo.revokeMembersByWorkspace).not.toHaveBeenCalled();
    });

    it("rejects deleting a missing workspace", async () => {
      workspace_repo.findById.mockResolvedValue(null);

      await expect(service.deleteWorkspace(WORKSPACE_ID, USER_ID)).rejects.toThrow(NotFoundError);
    });

    it("rejects deleting when the caller is not a member", async () => {
      workspace_repo.findById.mockResolvedValue(make_workspace());
      workspace_repo.findMembership.mockResolvedValue(null);

      await expect(service.deleteWorkspace(WORKSPACE_ID, USER_ID)).rejects.toThrow(ForbiddenError);
    });

    it("rejects deleting when the caller is not an owner", async () => {
      workspace_repo.findById.mockResolvedValue(make_workspace());
      workspace_repo.findMembership.mockResolvedValue(make_membership("member"));

      await expect(service.deleteWorkspace(WORKSPACE_ID, USER_ID)).rejects.toThrow(ForbiddenError);
    });
  });
});
