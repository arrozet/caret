import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { create_workspace_routes } from "../../src/routes/workspace_routes.js";
import { NotFoundError, ForbiddenError, ValidationError } from "../../src/lib/errors.js";

/**
 * Unit tests for create_workspace_routes (workspace_routes.ts).
 * Mockea WorkspaceService completamente y simula el ciclo req→handler→res
 * sin levantar un servidor HTTP real.
 */
describe("workspace_routes", () => {
  /* ── tipos de mocks ─────────────────────────────────── */

  type MockWorkspaceService = {
    create_workspace: ReturnType<typeof vi.fn>;
    get_workspace: ReturnType<typeof vi.fn>;
    list_workspaces: ReturnType<typeof vi.fn>;
    update_workspace: ReturnType<typeof vi.fn>;
    delete_workspace: ReturnType<typeof vi.fn>;
    invite_workspace_collaborator: ReturnType<typeof vi.fn>;
  };

  /* ── fixtures ───────────────────────────────────────── */

  const USER_ID = "user-ws-route-001";
  const WORKSPACE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  /** Construye un DTO de respuesta de workspace simulado. */
  function make_workspace_dto(overrides: Record<string, unknown> = {}) {
    return {
      id: WORKSPACE_ID,
      slug: "my-workspace",
      name: "My Workspace",
      created_by_user_id: USER_ID,
      role: "owner",
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
        (route_path === "/:id" && path.startsWith("/") && path.split("/").length === 2) ||
        route_path === "/:id/invite";

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

  let workspace_service: MockWorkspaceService;
  let router: ReturnType<typeof Router>;

  beforeEach(() => {
    workspace_service = {
      create_workspace: vi.fn(),
      get_workspace: vi.fn(),
      list_workspaces: vi.fn(),
      update_workspace: vi.fn(),
      delete_workspace: vi.fn(),
      invite_workspace_collaborator: vi.fn(),
    };

    workspace_service.createWorkspace = workspace_service.create_workspace;
    workspace_service.getWorkspace = workspace_service.get_workspace;
    workspace_service.listWorkspaces = workspace_service.list_workspaces;
    workspace_service.updateWorkspace = workspace_service.update_workspace;
    workspace_service.deleteWorkspace = workspace_service.delete_workspace;
    workspace_service.inviteWorkspaceCollaborator = workspace_service.invite_workspace_collaborator;

    router = create_workspace_routes(workspace_service as never);
  });

  /* ── POST / ─────────────────────────────────────────── */

  /**
   * Tests de POST / — crea un workspace.
   */
  describe("POST /", () => {
    /** verifica que crea un workspace y retorna status 201 */
    it("should_create_workspace_and_return_201", async () => {
      // Arrange
      const dto = { name: "My Workspace" };
      workspace_service.create_workspace.mockResolvedValue(make_workspace_dto());

      // Act
      const { status_code, body, next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(status_code).toBe(201);
      expect(body).toMatchObject({ id: WORKSPACE_ID, name: "My Workspace" });
      expect(workspace_service.create_workspace).toHaveBeenCalledWith(dto, USER_ID);
    });

    /** verifica que pasa next(ValidationError) cuando name está vacío */
    it("should_call_next_with_ValidationError_for_empty_name", async () => {
      // Arrange
      const dto = { name: "" };

      // Act
      const { next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
      expect(workspace_service.create_workspace).not.toHaveBeenCalled();
    });

    /** verifica que pasa el error del servicio a next() */
    it("should_pass_service_error_to_next", async () => {
      // Arrange
      const dto = { name: "My Workspace" };
      const conflict_err = new Error("Conflict");
      workspace_service.create_workspace.mockRejectedValue(conflict_err);

      // Act
      const { next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBe(conflict_err);
    });
  });

  /* ── POST /:id/invite ───────────────────────────────── */

  describe("POST /:id/invite", () => {
    it("should_invite_collaborator_and_return_201", async () => {
      // Arrange
      workspace_service.invite_workspace_collaborator.mockResolvedValue({
        workspace_id: WORKSPACE_ID,
        user_id: "invited-user-1",
        email: "juan@nombre.es",
        role: "member",
      });

      // Act
      const { status_code, body, next_error } = await call_route_handler(
        router,
        "post",
        "/:id/invite",
        {
          params: { id: WORKSPACE_ID },
          body: { email: "juan@nombre.es" },
        },
      );

      // Assert
      expect(next_error).toBeUndefined();
      expect(status_code).toBe(201);
      expect(body).toMatchObject({
        workspace_id: WORKSPACE_ID,
        email: "juan@nombre.es",
        role: "member",
      });
      expect(workspace_service.invite_workspace_collaborator).toHaveBeenCalledWith(
        WORKSPACE_ID,
        "juan@nombre.es",
        USER_ID,
      );
    });
  });

  /* ── GET / ──────────────────────────────────────────── */

  /**
   * Tests de GET / — lista workspaces del usuario.
   */
  describe("GET /", () => {
    /** verifica que retorna array plano cuando no hay parámetros de paginación */
    it("should_return_flat_array_without_pagination_params", async () => {
      // Arrange
      workspace_service.list_workspaces.mockResolvedValue({
        data: [make_workspace_dto()],
        pagination: { total: 1, limit: 50, offset: 0 },
      });

      // Act
      const { body, next_error } = await call_route_handler(router, "get", "/", { query: {} });

      // Assert
      expect(next_error).toBeUndefined();
      expect(Array.isArray(body)).toBe(true);
    });

    /** verifica que retorna envelope paginado con parámetros limit/offset */
    it("should_return_paginated_envelope_with_pagination_params", async () => {
      // Arrange
      workspace_service.list_workspaces.mockResolvedValue({
        data: [make_workspace_dto()],
        pagination: { total: 1, limit: 10, offset: 0 },
      });

      // Act
      const { body, next_error } = await call_route_handler(router, "get", "/", {
        query: { limit: "10", offset: "0" },
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("pagination");
    });

    /** verifica que pasa next(ValidationError) cuando limit es inválido */
    it("should_call_next_with_ValidationError_for_invalid_limit", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "get", "/", {
        query: { limit: "abc" },
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });
  });

  /* ── GET /:id ───────────────────────────────────────── */

  /**
   * Tests de GET /:id — obtiene un workspace por ID.
   */
  describe("GET /:id", () => {
    /** verifica que retorna el workspace cuando el ID es UUID válido */
    it("should_return_workspace_for_valid_uuid_id", async () => {
      // Arrange
      workspace_service.get_workspace.mockResolvedValue(make_workspace_dto());

      // Act
      const { body, next_error } = await call_route_handler(router, "get", "/:id", {
        params: { id: WORKSPACE_ID },
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(body).toMatchObject({ id: WORKSPACE_ID });
    });

    /** verifica que pasa next(ValidationError) cuando el ID no es UUID */
    it("should_call_next_with_ValidationError_for_invalid_uuid", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "get", "/:id", {
        params: { id: "not-a-valid-uuid" },
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });

    /** verifica que pasa next(NotFoundError) del servicio */
    it("should_pass_NotFoundError_from_service_to_next", async () => {
      // Arrange
      workspace_service.get_workspace.mockRejectedValue(new NotFoundError("Workspace not found"));

      // Act
      const { next_error } = await call_route_handler(router, "get", "/:id", {
        params: { id: WORKSPACE_ID },
      });

      // Assert
      expect(next_error).toBeInstanceOf(NotFoundError);
    });

    /** verifica que pasa next(ForbiddenError) del servicio */
    it("should_pass_ForbiddenError_from_service_to_next", async () => {
      // Arrange
      workspace_service.get_workspace.mockRejectedValue(new ForbiddenError("Not a member"));

      // Act
      const { next_error } = await call_route_handler(router, "get", "/:id", {
        params: { id: WORKSPACE_ID },
      });

      // Assert
      expect(next_error).toBeInstanceOf(ForbiddenError);
    });
  });

  describe("PATCH /:id", () => {
    it("should_rename_workspace_and_return_200", async () => {
      workspace_service.update_workspace.mockResolvedValue(make_workspace_dto({ name: "Studio" }));

      const { status_code, body, next_error } = await call_route_handler(router, "patch", "/:id", {
        params: { id: WORKSPACE_ID },
        body: { name: "Studio" },
      });

      expect(next_error).toBeUndefined();
      expect(status_code).toBe(200);
      expect(body).toMatchObject({ id: WORKSPACE_ID, name: "Studio" });
      expect(workspace_service.update_workspace).toHaveBeenCalledWith(
        WORKSPACE_ID,
        { name: "Studio" },
        USER_ID,
      );
    });

    it("should_trim_patch_name_before_calling_service", async () => {
      workspace_service.update_workspace.mockResolvedValue(make_workspace_dto({ name: "Studio" }));

      const { next_error } = await call_route_handler(router, "patch", "/:id", {
        params: { id: WORKSPACE_ID },
        body: { name: "  Studio  " },
      });

      expect(next_error).toBeUndefined();
      expect(workspace_service.update_workspace).toHaveBeenCalledWith(
        WORKSPACE_ID,
        { name: "Studio" },
        USER_ID,
      );
    });

    it("should_call_next_with_ValidationError_for_empty_patch_name", async () => {
      const { next_error } = await call_route_handler(router, "patch", "/:id", {
        params: { id: WORKSPACE_ID },
        body: { name: "   " },
      });

      expect(next_error).toBeInstanceOf(ValidationError);
      expect(workspace_service.update_workspace).not.toHaveBeenCalled();
    });

    it("should_pass_NotFoundError_from_patch_service_to_next", async () => {
      workspace_service.update_workspace.mockRejectedValue(
        new NotFoundError("Workspace not found"),
      );

      const { next_error } = await call_route_handler(router, "patch", "/:id", {
        params: { id: WORKSPACE_ID },
        body: { name: "Studio" },
      });

      expect(next_error).toBeInstanceOf(NotFoundError);
    });

    it("should_pass_ForbiddenError_from_patch_service_to_next", async () => {
      workspace_service.update_workspace.mockRejectedValue(new ForbiddenError("Forbidden"));

      const { next_error } = await call_route_handler(router, "patch", "/:id", {
        params: { id: WORKSPACE_ID },
        body: { name: "Studio" },
      });

      expect(next_error).toBeInstanceOf(ForbiddenError);
    });
  });

  describe("DELETE /:id", () => {
    it("should_delete_workspace_and_return_204", async () => {
      const { status_code, body, next_error } = await call_route_handler(router, "delete", "/:id", {
        params: { id: WORKSPACE_ID },
      });

      expect(next_error).toBeUndefined();
      expect(status_code).toBe(204);
      expect(body).toBe(null);
      expect(workspace_service.delete_workspace).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID);
    });

    it("should_pass_NotFoundError_from_delete_service_to_next", async () => {
      workspace_service.delete_workspace.mockRejectedValue(
        new NotFoundError("Workspace not found"),
      );

      const { next_error } = await call_route_handler(router, "delete", "/:id", {
        params: { id: WORKSPACE_ID },
      });

      expect(next_error).toBeInstanceOf(NotFoundError);
    });

    it("should_pass_ForbiddenError_from_delete_service_to_next", async () => {
      workspace_service.delete_workspace.mockRejectedValue(new ForbiddenError("Forbidden"));

      const { next_error } = await call_route_handler(router, "delete", "/:id", {
        params: { id: WORKSPACE_ID },
      });

      expect(next_error).toBeInstanceOf(ForbiddenError);
    });
  });
});
