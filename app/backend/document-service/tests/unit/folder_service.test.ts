import { describe, it, expect, vi, beforeEach } from "vitest";
import { FolderService } from "../../src/services/folder_service.js";
import {
  NotFoundError,
  ForbiddenError,
} from "../../src/lib/errors.js";

/**
 * Unit tests for FolderService.
 * Todos los repositorios están mockeados — sin base de datos real.
 * Verifica autorización de membresía, validación de parent folder,
 * prevención de referencias circulares y mapeo a DTOs.
 */
describe("FolderService", () => {
  /* ── tipos de mocks ─────────────────────────────────── */

  type MockFolderRepo = {
    create: ReturnType<typeof vi.fn>;
    find_by_id: ReturnType<typeof vi.fn>;
    list_by_workspace: ReturnType<typeof vi.fn>;
    list_all_by_workspace: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    soft_delete: ReturnType<typeof vi.fn>;
  };

  type MockWorkspaceRepo = {
    find_membership: ReturnType<typeof vi.fn>;
  };

  /* ── fixtures ───────────────────────────────────────── */

  const USER_ID = "user-abc-001";
  const WORKSPACE_ID = "ws-abc-002";
  const FOLDER_ID = "folder-abc-003";
  const PARENT_FOLDER_ID = "folder-parent-004";

  /** Construye una fila de folder simulada. */
  function make_folder(overrides: Record<string, unknown> = {}) {
    return {
      id: FOLDER_ID,
      workspace_id: WORKSPACE_ID,
      parent_folder_id: null as string | null,
      name: "My Folder",
      sort_order: null as number | null,
      created_by_user_id: USER_ID,
      created_at: new Date("2025-05-01T00:00:00Z"),
      updated_at: new Date("2025-05-01T00:00:00Z"),
      deleted_at: null,
      ...overrides,
    };
  }

  /** Construye una fila de membresía simulada. */
  function make_membership(role = "member") {
    return { workspace_id: WORKSPACE_ID, user_id: USER_ID, role };
  }

  /* ── estado de mocks por test ───────────────────────── */

  let folder_repo: MockFolderRepo;
  let workspace_repo: MockWorkspaceRepo;
  let service: FolderService;

  beforeEach(() => {
    folder_repo = {
      create: vi.fn(),
      find_by_id: vi.fn(),
      list_by_workspace: vi.fn(),
      list_all_by_workspace: vi.fn(),
      update: vi.fn(),
      soft_delete: vi.fn(),
    };

    workspace_repo = {
      find_membership: vi.fn(),
    };

    service = new FolderService(folder_repo as never, workspace_repo as never);
  });

  /* ── create_folder ───────────────────────────────────── */

  /**
   * Tests de create_folder: creación básica, con parent, validaciones y errores.
   */
  describe("create_folder", () => {
    /** verifica que crea un folder raíz cuando el usuario es miembro */
    it("should_create_root_folder_when_user_is_member", async () => {
      // Arrange
      const dto = { workspace_id: WORKSPACE_ID, name: "My Folder" };
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.create.mockResolvedValue(make_folder());

      // Act
      const result = await service.create_folder(dto, USER_ID);

      // Assert
      expect(folder_repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: WORKSPACE_ID,
          name: "My Folder",
          parent_folder_id: null,
          created_by_user_id: USER_ID,
        }),
      );
      expect(result.id).toBe(FOLDER_ID);
      expect(result.parent_folder_id).toBeNull();
    });

    /** verifica que crea un subfolder cuando el parent existe en el mismo workspace */
    it("should_create_subfolder_when_parent_exists_in_same_workspace", async () => {
      // Arrange
      const dto = {
        workspace_id: WORKSPACE_ID,
        name: "Sub Folder",
        parent_folder_id: PARENT_FOLDER_ID,
      };
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.find_by_id.mockResolvedValue(
        make_folder({ id: PARENT_FOLDER_ID }),
      );
      folder_repo.create.mockResolvedValue(
        make_folder({ parent_folder_id: PARENT_FOLDER_ID }),
      );

      // Act
      const result = await service.create_folder(dto, USER_ID);

      // Assert
      expect(folder_repo.find_by_id).toHaveBeenCalledWith(PARENT_FOLDER_ID);
      expect(result.parent_folder_id).toBe(PARENT_FOLDER_ID);
    });

    /** verifica que lanza ForbiddenError cuando el usuario no es miembro del workspace */
    it("should_throw_ForbiddenError_when_user_not_member", async () => {
      // Arrange
      const dto = { workspace_id: WORKSPACE_ID, name: "My Folder" };
      workspace_repo.find_membership.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create_folder(dto, USER_ID)).rejects.toThrow(
        ForbiddenError,
      );
      expect(folder_repo.create).not.toHaveBeenCalled();
    });

    /** verifica que lanza NotFoundError cuando el parent folder no existe */
    it("should_throw_NotFoundError_when_parent_folder_not_found", async () => {
      // Arrange
      const dto = {
        workspace_id: WORKSPACE_ID,
        name: "Sub Folder",
        parent_folder_id: "nonexistent-parent",
      };
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.find_by_id.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create_folder(dto, USER_ID)).rejects.toThrow(
        NotFoundError,
      );
    });

    /** verifica que lanza ForbiddenError cuando el parent pertenece a otro workspace */
    it("should_throw_ForbiddenError_when_parent_folder_in_different_workspace", async () => {
      // Arrange
      const dto = {
        workspace_id: WORKSPACE_ID,
        name: "Sub Folder",
        parent_folder_id: PARENT_FOLDER_ID,
      };
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.find_by_id.mockResolvedValue(
        make_folder({
          id: PARENT_FOLDER_ID,
          workspace_id: "other-workspace-id",
        }),
      );

      // Act & Assert
      await expect(service.create_folder(dto, USER_ID)).rejects.toThrow(
        ForbiddenError,
      );
    });

    /** verifica que el DTO de respuesta tiene los campos correctos */
    it("should_return_correct_response_dto_shape", async () => {
      // Arrange
      const dto = {
        workspace_id: WORKSPACE_ID,
        name: "My Folder",
        sort_order: 3,
      };
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.create.mockResolvedValue(
        make_folder({ sort_order: 3 }),
      );

      // Act
      const result = await service.create_folder(dto, USER_ID);

      // Assert
      expect(result).toMatchObject({
        id: FOLDER_ID,
        workspace_id: WORKSPACE_ID,
        name: "My Folder",
        sort_order: 3,
      });
      expect(typeof result.created_at).toBe("string");
      expect(typeof result.updated_at).toBe("string");
    });
  });

  /* ── get_folder ──────────────────────────────────────── */

  /**
   * Tests de get_folder: éxito, folder no encontrado, usuario no miembro.
   */
  describe("get_folder", () => {
    /** verifica que retorna el folder cuando el usuario es miembro */
    it("should_return_folder_when_user_is_member", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(make_folder());
      workspace_repo.find_membership.mockResolvedValue(make_membership());

      // Act
      const result = await service.get_folder(FOLDER_ID, USER_ID);

      // Assert
      expect(result.id).toBe(FOLDER_ID);
      expect(result.name).toBe("My Folder");
    });

    /** verifica que lanza NotFoundError cuando el folder no existe */
    it("should_throw_NotFoundError_when_folder_not_found", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.get_folder("nonexistent-id", USER_ID),
      ).rejects.toThrow(NotFoundError);
    });

    /** verifica que lanza ForbiddenError cuando el usuario no es miembro del workspace */
    it("should_throw_ForbiddenError_when_user_not_member", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(make_folder());
      workspace_repo.find_membership.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.get_folder(FOLDER_ID, USER_ID),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  /* ── list_folders ────────────────────────────────────── */

  /**
   * Tests de list_folders: paginación, filtro por parent, usuario no miembro.
   */
  describe("list_folders", () => {
    /** verifica que retorna la lista paginada de folders raíz */
    it("should_return_paginated_root_folders", async () => {
      // Arrange
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.list_by_workspace.mockResolvedValue({
        data: [make_folder({ id: "f-1" }), make_folder({ id: "f-2" })],
        total: 2,
      });

      // Act
      const result = await service.list_folders(
        WORKSPACE_ID,
        USER_ID,
        null,
        { limit: 50, offset: 0 },
      );

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({ total: 2, limit: 50, offset: 0 });
    });

    /** verifica que pasa el parent_folder_id al repositorio */
    it("should_pass_parent_folder_id_to_repo", async () => {
      // Arrange
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.list_by_workspace.mockResolvedValue({ data: [], total: 0 });

      // Act
      await service.list_folders(
        WORKSPACE_ID,
        USER_ID,
        PARENT_FOLDER_ID,
        { limit: 50, offset: 0 },
      );

      // Assert
      expect(folder_repo.list_by_workspace).toHaveBeenCalledWith(
        WORKSPACE_ID,
        PARENT_FOLDER_ID,
        { limit: 50, offset: 0 },
      );
    });

    /** verifica que lanza ForbiddenError cuando el usuario no es miembro */
    it("should_throw_ForbiddenError_when_user_not_member", async () => {
      // Arrange
      workspace_repo.find_membership.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.list_folders(WORKSPACE_ID, USER_ID, null, {
          limit: 50,
          offset: 0,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  /* ── list_all_folders ────────────────────────────────── */

  /**
   * Tests de list_all_folders: lista flat de todos los folders del workspace.
   */
  describe("list_all_folders", () => {
    /** verifica que retorna todos los folders del workspace sin filtro de parent */
    it("should_return_all_folders_flat_list", async () => {
      // Arrange
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.list_all_by_workspace.mockResolvedValue({
        data: [
          make_folder({ id: "f-1", parent_folder_id: null }),
          make_folder({ id: "f-2", parent_folder_id: "f-1" }),
        ],
        total: 2,
      });

      // Act
      const result = await service.list_all_folders(
        WORKSPACE_ID,
        USER_ID,
        { limit: 100, offset: 0 },
      );

      // Assert
      expect(result.data).toHaveLength(2);
      expect(folder_repo.list_all_by_workspace).toHaveBeenCalledWith(
        WORKSPACE_ID,
        { limit: 100, offset: 0 },
      );
    });

    /** verifica que lanza ForbiddenError cuando el usuario no es miembro */
    it("should_throw_ForbiddenError_when_user_not_member", async () => {
      // Arrange
      workspace_repo.find_membership.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.list_all_folders(WORKSPACE_ID, USER_ID, { limit: 50, offset: 0 }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  /* ── update_folder ───────────────────────────────────── */

  /**
   * Tests de update_folder: actualización de nombre, movimiento a otro parent,
   * prevención de referencia circular, y errores.
   */
  describe("update_folder", () => {
    /** verifica que actualiza el nombre del folder */
    it("should_update_folder_name", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(make_folder());
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.update.mockResolvedValue(make_folder({ name: "Renamed" }));

      // Act
      const result = await service.update_folder(
        FOLDER_ID,
        { name: "Renamed" },
        USER_ID,
      );

      // Assert
      expect(folder_repo.update).toHaveBeenCalledWith(
        FOLDER_ID,
        expect.objectContaining({ name: "Renamed" }),
      );
      expect(result.name).toBe("Renamed");
    });

    /** verifica que actualiza sort_order correctamente */
    it("should_update_sort_order", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(make_folder());
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.update.mockResolvedValue(make_folder({ sort_order: 5 }));

      // Act
      const result = await service.update_folder(
        FOLDER_ID,
        { sort_order: 5 },
        USER_ID,
      );

      // Assert
      expect(result.sort_order).toBe(5);
    });

    /** verifica que lanza ForbiddenError al intentar que un folder sea su propio parent */
    it("should_throw_ForbiddenError_when_setting_self_as_parent", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(make_folder());
      workspace_repo.find_membership.mockResolvedValue(make_membership());

      // Act & Assert
      await expect(
        service.update_folder(
          FOLDER_ID,
          { parent_folder_id: FOLDER_ID },
          USER_ID,
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    /** verifica que lanza NotFoundError cuando el folder no existe */
    it("should_throw_NotFoundError_when_folder_not_found", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.update_folder(FOLDER_ID, { name: "New" }, USER_ID),
      ).rejects.toThrow(NotFoundError);
    });

    /** verifica que lanza ForbiddenError cuando el usuario no es miembro */
    it("should_throw_ForbiddenError_when_user_not_member", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(make_folder());
      workspace_repo.find_membership.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.update_folder(FOLDER_ID, { name: "New" }, USER_ID),
      ).rejects.toThrow(ForbiddenError);
    });

    /** verifica que lanza NotFoundError cuando el folder fue borrado durante el update */
    it("should_throw_NotFoundError_when_folder_deleted_during_update", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(make_folder());
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.update.mockResolvedValue(null); // deleted during update

      // Act & Assert
      await expect(
        service.update_folder(FOLDER_ID, { name: "New" }, USER_ID),
      ).rejects.toThrow(NotFoundError);
    });

    /** verifica que no actualiza campos no enviados en el DTO */
    it("should_not_update_fields_not_in_dto", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(make_folder());
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.update.mockResolvedValue(make_folder());

      // Act
      await service.update_folder(FOLDER_ID, {}, USER_ID);

      // Assert
      expect(folder_repo.update).toHaveBeenCalledWith(FOLDER_ID, {});
    });
  });

  /* ── delete_folder ───────────────────────────────────── */

  /**
   * Tests de delete_folder: soft-delete exitoso y errores de autorización.
   */
  describe("delete_folder", () => {
    /** verifica que hace soft-delete del folder */
    it("should_soft_delete_folder", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(make_folder());
      workspace_repo.find_membership.mockResolvedValue(make_membership());
      folder_repo.soft_delete.mockResolvedValue(make_folder());

      // Act
      await service.delete_folder(FOLDER_ID, USER_ID);

      // Assert
      expect(folder_repo.soft_delete).toHaveBeenCalledWith(FOLDER_ID);
    });

    /** verifica que lanza NotFoundError cuando el folder no existe */
    it("should_throw_NotFoundError_when_folder_not_found", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.delete_folder("nonexistent-id", USER_ID),
      ).rejects.toThrow(NotFoundError);
    });

    /** verifica que lanza ForbiddenError cuando el usuario no es miembro */
    it("should_throw_ForbiddenError_when_user_not_member", async () => {
      // Arrange
      folder_repo.find_by_id.mockResolvedValue(make_folder());
      workspace_repo.find_membership.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.delete_folder(FOLDER_ID, USER_ID),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
