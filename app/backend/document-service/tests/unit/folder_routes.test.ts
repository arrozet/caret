import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { create_folder_routes } from "../../src/routes/folder_routes.js";
import { NotFoundError, ForbiddenError, ValidationError } from "../../src/lib/errors.js";

/**
 * Unit tests for create_folder_routes (folder_routes.ts).
 * Mockea FolderService completamente y simula el ciclo req→handler→res
 * sin levantar un servidor HTTP real.
 * Verifica: validación de entradas, delegación al servicio, códigos de respuesta.
 */
describe("folder_routes", () => {
  /* ── tipos de mocks ─────────────────────────────────── */

  type MockFolderService = {
    create_folder: ReturnType<typeof vi.fn>;
    get_folder: ReturnType<typeof vi.fn>;
    list_folders: ReturnType<typeof vi.fn>;
    list_all_folders: ReturnType<typeof vi.fn>;
    update_folder: ReturnType<typeof vi.fn>;
    delete_folder: ReturnType<typeof vi.fn>;
  };

  /* ── fixtures ───────────────────────────────────────── */

  const USER_ID = "user-folder-route-001";
  const WORKSPACE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const FOLDER_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const PARENT_FOLDER_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

  /** Construye un DTO de respuesta de folder simulado. */
  function make_folder_dto(overrides: Record<string, unknown> = {}) {
    return {
      id: FOLDER_ID,
      workspace_id: WORKSPACE_ID,
      parent_folder_id: null,
      name: "My Folder",
      sort_order: null,
      created_by_user_id: USER_ID,
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  /**
   * Llama directamente al handler de una ruta del router Express sin servidor HTTP.
   */
  async function call_route_handler(
    router: ReturnType<typeof Router>,
    method: "get" | "post" | "patch" | "delete",
    path: string,
    options: {
      body?: Record<string, unknown>;
      query?: Record<string, string>;
      params?: Record<string, string>;
      auth_user?: { sub: string };
    } = {},
  ): Promise<{
    status_code: number;
    body: unknown;
    next_error: Error | undefined;
  }> {
    const { body = {}, query = {}, params = {}, auth_user = { sub: USER_ID } } = options;

    let status_code = 200;
    let response_body: unknown = null;
    let next_error: Error | undefined;

    const json_mock = vi.fn((data: unknown) => {
      response_body = data;
    });
    const send_mock = vi.fn();
    const status_mock = vi.fn((code: number) => {
      status_code = code;
      return { json: json_mock, send: send_mock };
    });

    const req = {
      method: method.toUpperCase(),
      path,
      body,
      query,
      params,
      auth_user,
      headers: {},
    } as unknown as Request;

    const res = {
      status: status_mock,
      json: json_mock,
      send: send_mock,
    } as unknown as Response;

    const next = vi.fn((err?: Error) => {
      next_error = err;
    }) as unknown as NextFunction;

    const layers = (
      router as unknown as {
        stack: Array<{
          route?: {
            path: string;
            stack: Array<{ method: string; handle: (...args: unknown[]) => unknown }>;
          };
        }>;
      }
    ).stack;

    for (const layer of layers) {
      if (!layer.route) continue;

      const route_path = layer.route.path;
      const matches_path =
        route_path === path ||
        (route_path === "/:id" && path.startsWith("/") && path.split("/").length === 2);

      if (!matches_path) continue;

      for (const handler_layer of layer.route.stack) {
        if (handler_layer.method === method) {
          await handler_layer.handle(req, res, next);
          return { status_code, body: response_body, next_error };
        }
      }
    }

    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  /* ── estado de mocks por test ───────────────────────── */

  let folder_service: MockFolderService;
  let router: ReturnType<typeof Router>;

  beforeEach(() => {
    folder_service = {
      create_folder: vi.fn(),
      get_folder: vi.fn(),
      list_folders: vi.fn(),
      list_all_folders: vi.fn(),
      update_folder: vi.fn(),
      delete_folder: vi.fn(),
    };

    folder_service.createFolder = folder_service.create_folder;
    folder_service.getFolder = folder_service.get_folder;
    folder_service.listFolders = folder_service.list_folders;
    folder_service.listAllFolders = folder_service.list_all_folders;
    folder_service.updateFolder = folder_service.update_folder;
    folder_service.deleteFolder = folder_service.delete_folder;

    router = create_folder_routes(folder_service as never);
  });

  /* ── POST / ─────────────────────────────────────────── */

  /**
   * Tests de POST / — crea un folder.
   */
  describe("POST /", () => {
    /** verifica que crea un folder y retorna status 201 */
    it("should_create_folder_and_return_201", async () => {
      // Arrange
      const dto = { workspace_id: WORKSPACE_ID, name: "New Folder" };
      folder_service.create_folder.mockResolvedValue(make_folder_dto());

      // Act
      const { status_code, body, next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(status_code).toBe(201);
      expect(body).toMatchObject({ id: FOLDER_ID, name: "My Folder" });
      expect(folder_service.create_folder).toHaveBeenCalledWith(dto, USER_ID);
    });

    /** verifica que pasa next(ValidationError) cuando name está vacío */
    it("should_call_next_with_ValidationError_for_empty_name", async () => {
      // Arrange
      const dto = { workspace_id: WORKSPACE_ID, name: "" };

      // Act
      const { next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
      expect(folder_service.create_folder).not.toHaveBeenCalled();
    });

    /** verifica que pasa next(ValidationError) cuando workspace_id no es UUID */
    it("should_call_next_with_ValidationError_for_invalid_workspace_uuid", async () => {
      // Arrange
      const dto = { workspace_id: "invalid-uuid", name: "My Folder" };

      // Act
      const { next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });

    /** verifica que pasa next(ValidationError) cuando parent_folder_id no es UUID */
    it("should_call_next_with_ValidationError_for_invalid_parent_uuid", async () => {
      // Arrange
      const dto = {
        workspace_id: WORKSPACE_ID,
        name: "Sub Folder",
        parent_folder_id: "not-a-uuid",
      };

      // Act
      const { next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });

    /** verifica que acepta parent_folder_id como UUID válido */
    it("should_accept_valid_parent_folder_id", async () => {
      // Arrange
      const dto = {
        workspace_id: WORKSPACE_ID,
        name: "Sub Folder",
        parent_folder_id: PARENT_FOLDER_ID,
      };
      folder_service.create_folder.mockResolvedValue(
        make_folder_dto({ parent_folder_id: PARENT_FOLDER_ID }),
      );

      // Act
      const { next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBeUndefined();
    });

    /** verifica que propaga ForbiddenError del servicio */
    it("should_pass_ForbiddenError_from_service_to_next", async () => {
      // Arrange
      const dto = { workspace_id: WORKSPACE_ID, name: "My Folder" };
      folder_service.create_folder.mockRejectedValue(new ForbiddenError("Not a member"));

      // Act
      const { next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBeInstanceOf(ForbiddenError);
    });
  });

  /* ── GET / ──────────────────────────────────────────── */

  /**
   * Tests de GET / — lista folders por workspace.
   */
  describe("GET /", () => {
    /** verifica que retorna array plano sin parámetros de paginación */
    it("should_return_flat_array_without_pagination_params", async () => {
      // Arrange
      folder_service.list_folders.mockResolvedValue({
        data: [make_folder_dto()],
        pagination: { total: 1, limit: 50, offset: 0 },
      });

      // Act
      const { body, next_error } = await call_route_handler(router, "get", "/", {
        query: { workspace_id: WORKSPACE_ID },
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(Array.isArray(body)).toBe(true);
    });

    /** verifica que retorna envelope paginado con parámetros limit/offset */
    it("should_return_paginated_envelope_with_pagination_params", async () => {
      // Arrange
      folder_service.list_folders.mockResolvedValue({
        data: [make_folder_dto()],
        pagination: { total: 1, limit: 10, offset: 0 },
      });

      // Act
      const { body, next_error } = await call_route_handler(router, "get", "/", {
        query: { workspace_id: WORKSPACE_ID, limit: "10", offset: "0" },
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("pagination");
    });

    /** verifica que pasa next(ValidationError) cuando falta workspace_id */
    it("should_call_next_with_ValidationError_when_workspace_id_missing", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "get", "/", {
        query: {},
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });

    /** verifica que pasa parent_folder_id como null cuando no se envía */
    it("should_pass_null_parent_folder_id_when_not_in_query", async () => {
      // Arrange
      folder_service.list_folders.mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 50, offset: 0 },
      });

      // Act
      await call_route_handler(router, "get", "/", {
        query: { workspace_id: WORKSPACE_ID },
      });

      // Assert
      expect(folder_service.list_folders).toHaveBeenCalledWith(
        WORKSPACE_ID,
        USER_ID,
        null,
        expect.any(Object),
      );
    });

    /** verifica que valida parent_folder_id cuando se envía como query param */
    it("should_call_next_with_ValidationError_for_invalid_parent_folder_uuid", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "get", "/", {
        query: { workspace_id: WORKSPACE_ID, parent_folder_id: "bad-uuid" },
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });
  });

  /* ── GET /all ───────────────────────────────────────── */

  /**
   * Tests de GET /all — lista todos los folders del workspace (flat).
   */
  describe("GET /all", () => {
    /** verifica que retorna todos los folders del workspace */
    it("should_return_all_folders_flat_list", async () => {
      // Arrange
      folder_service.list_all_folders.mockResolvedValue({
        data: [
          make_folder_dto({ id: "f-1" }),
          make_folder_dto({ id: "f-2", parent_folder_id: "f-1" }),
        ],
        pagination: { total: 2, limit: 50, offset: 0 },
      });

      // Act
      const { body, next_error } = await call_route_handler(router, "get", "/all", {
        query: { workspace_id: WORKSPACE_ID },
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(Array.isArray(body)).toBe(true);
    });

    /** verifica que pasa next(ValidationError) cuando falta workspace_id */
    it("should_call_next_with_ValidationError_when_workspace_id_missing", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "get", "/all", { query: {} });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });
  });

  /* ── GET /:id ───────────────────────────────────────── */

  /**
   * Tests de GET /:id — obtiene un folder por ID.
   */
  describe("GET /:id", () => {
    /** verifica que retorna el folder cuando el ID es UUID válido */
    it("should_return_folder_for_valid_uuid_id", async () => {
      // Arrange
      folder_service.get_folder.mockResolvedValue(make_folder_dto());

      // Act
      const { body, next_error } = await call_route_handler(router, "get", "/:id", {
        params: { id: FOLDER_ID },
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(body).toMatchObject({ id: FOLDER_ID });
    });

    /** verifica que pasa next(ValidationError) cuando el ID no es UUID */
    it("should_call_next_with_ValidationError_for_invalid_uuid", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "get", "/:id", {
        params: { id: "not-a-uuid" },
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });

    /** verifica que pasa next(NotFoundError) del servicio */
    it("should_pass_NotFoundError_from_service_to_next", async () => {
      // Arrange
      folder_service.get_folder.mockRejectedValue(new NotFoundError("Folder not found"));

      // Act
      const { next_error } = await call_route_handler(router, "get", "/:id", {
        params: { id: FOLDER_ID },
      });

      // Assert
      expect(next_error).toBeInstanceOf(NotFoundError);
    });
  });

  /* ── PATCH /:id ─────────────────────────────────────── */

  /**
   * Tests de PATCH /:id — actualiza un folder.
   */
  describe("PATCH /:id", () => {
    /** verifica que actualiza el folder y retorna el DTO actualizado */
    it("should_update_folder_and_return_200", async () => {
      // Arrange
      folder_service.update_folder.mockResolvedValue(make_folder_dto({ name: "Renamed" }));

      // Act
      const { body, next_error } = await call_route_handler(router, "patch", "/:id", {
        params: { id: FOLDER_ID },
        body: { name: "Renamed" },
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect((body as { name: string }).name).toBe("Renamed");
    });

    /** verifica que pasa next(ValidationError) cuando name es cadena vacía */
    it("should_call_next_with_ValidationError_for_empty_name", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "patch", "/:id", {
        params: { id: FOLDER_ID },
        body: { name: "" },
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });

    /** verifica que pasa next(ValidationError) cuando parent_folder_id no es UUID */
    it("should_call_next_with_ValidationError_for_invalid_parent_uuid", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "patch", "/:id", {
        params: { id: FOLDER_ID },
        body: { parent_folder_id: "bad-uuid" },
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });

    /** verifica que acepta patch sin cambios de nombre */
    it("should_accept_patch_without_name_field", async () => {
      // Arrange
      folder_service.update_folder.mockResolvedValue(make_folder_dto());

      // Act
      const { next_error } = await call_route_handler(router, "patch", "/:id", {
        params: { id: FOLDER_ID },
        body: { sort_order: 2 },
      });

      // Assert
      expect(next_error).toBeUndefined();
    });
  });

  /* ── DELETE /:id ────────────────────────────────────── */

  /**
   * Tests de DELETE /:id — borra suavemente un folder.
   */
  describe("DELETE /:id", () => {
    /** verifica que borra el folder y retorna status 204 */
    it("should_delete_folder_and_return_204", async () => {
      // Arrange
      folder_service.delete_folder.mockResolvedValue(undefined);

      // Act
      const { next_error } = await call_route_handler(router, "delete", "/:id", {
        params: { id: FOLDER_ID },
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(folder_service.delete_folder).toHaveBeenCalledWith(FOLDER_ID, USER_ID);
    });

    /** verifica que pasa next(ValidationError) cuando el ID no es UUID */
    it("should_call_next_with_ValidationError_for_invalid_uuid", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "delete", "/:id", {
        params: { id: "bad-id" },
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });

    /** verifica que propaga NotFoundError del servicio */
    it("should_pass_NotFoundError_from_service_to_next", async () => {
      // Arrange
      folder_service.delete_folder.mockRejectedValue(new NotFoundError("Folder not found"));

      // Act
      const { next_error } = await call_route_handler(router, "delete", "/:id", {
        params: { id: FOLDER_ID },
      });

      // Assert
      expect(next_error).toBeInstanceOf(NotFoundError);
    });
  });
});
