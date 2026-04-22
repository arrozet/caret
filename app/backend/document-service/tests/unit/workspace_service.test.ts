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
    create: ReturnType<typeof vi.fn>;
    findBySlug: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findPersonalByUser: ReturnType<typeof vi.fn>;
    listByUser: ReturnType<typeof vi.fn>;
    addMember: ReturnType<typeof vi.fn>;
    findMembership: ReturnType<typeof vi.fn>;
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
  let service: WorkspaceService;

  beforeEach(() => {
    workspace_repo = {
      create: vi.fn(),
      findBySlug: vi.fn(),
      findById: vi.fn(),
      findPersonalByUser: vi.fn(),
      listByUser: vi.fn(),
      addMember: vi.fn(),
      findMembership: vi.fn(),
    };

    workspace_repo.find_by_slug = workspace_repo.findBySlug;
    workspace_repo.find_by_id = workspace_repo.findById;
    workspace_repo.list_by_user = workspace_repo.listByUser;
    workspace_repo.add_member = workspace_repo.addMember;
    workspace_repo.find_membership = workspace_repo.findMembership;

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
    });

    /** verifica que auto-genera slug desde el nombre cuando no se provee */
    it("should_auto_generate_slug_from_name_when_not_provided", async () => {
      // Arrange
      const dto = { name: "Hello World Project" };
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
      workspace_repo.findBySlug.mockResolvedValue(null);
      workspace_repo.create.mockRejectedValue(new Error("DB timeout"));

      // Act & Assert
      await expect(service.create_workspace(dto, USER_ID)).rejects.toThrow("DB timeout");
    });

    /** verifica que el DTO de respuesta contiene campos correctos */
    it("should_return_correct_response_dto_shape", async () => {
      // Arrange
      const dto = { name: "My Project", slug: "my-project" };
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
});
