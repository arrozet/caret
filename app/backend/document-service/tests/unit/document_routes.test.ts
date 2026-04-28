import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { create_document_routes } from "../../src/routes/document_routes.js";
import { NotFoundError, ForbiddenError, ValidationError } from "../../src/lib/errors.js";

/**
 * Unit tests for create_document_routes (document_routes.ts).
 * Mockea DocumentService completamente y simula el ciclo req→handler→res
 * sin levantar un servidor HTTP real.
 * Verifica: validación de entradas, delegación al servicio, códigos de respuesta.
 */
describe("document_routes", () => {
  /* ── tipos de mocks ─────────────────────────────────── */

  type MockDocumentService = {
    create_document: ReturnType<typeof vi.fn>;
    get_document: ReturnType<typeof vi.fn>;
    list_documents: ReturnType<typeof vi.fn>;
    list_shared_documents: ReturnType<typeof vi.fn>;
    update_document: ReturnType<typeof vi.fn>;
    delete_document: ReturnType<typeof vi.fn>;
    invite_document_collaborator: ReturnType<typeof vi.fn>;
  };

  /* ── fixtures ───────────────────────────────────────── */

  const USER_ID = "user-route-001";
  const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
  const DOCUMENT_ID = "22222222-2222-2222-2222-222222222222";
  const FOLDER_ID = "33333333-3333-3333-3333-333333333333";

  /** Construye un DTO de respuesta de documento simulado. */
  function make_doc_dto(overrides: Record<string, unknown> = {}) {
    return {
      id: DOCUMENT_ID,
      workspace_id: WORKSPACE_ID,
      folder_id: null,
      title: "Test Doc",
      status: "active",
      visibility: "private",
      owner_user_id: USER_ID,
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  /**
   * Ejecuta un handler de Express de forma directa, simulando el ciclo
   * req/res/next sin servidor HTTP.
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

    /* Find the matching route layer and call its handler */
    const layers = (
      router as unknown as {
        stack: Array<{
          route?: {
            path: string;
            stack: Array<{
              method: string;
              handle: (
                req: RequestCustom,
                res: Response,
                next: NextFunction,
              ) => void | Promise<void>;
            }>;
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

  let document_service: MockDocumentService;
  let router: ReturnType<typeof Router>;

  beforeEach(() => {
    document_service = {
      create_document: vi.fn(),
      get_document: vi.fn(),
      list_documents: vi.fn(),
      list_shared_documents: vi.fn(),
      update_document: vi.fn(),
      delete_document: vi.fn(),
      invite_document_collaborator: vi.fn(),
    };

    document_service.createDocument = document_service.create_document;
    document_service.getDocument = document_service.get_document;
    document_service.listDocuments = document_service.list_documents;
    document_service.listSharedDocuments = document_service.list_shared_documents;
    document_service.updateDocument = document_service.update_document;
    document_service.deleteDocument = document_service.delete_document;
    document_service.inviteDocumentCollaborator = document_service.invite_document_collaborator;

    router = create_document_routes(document_service as never);
  });

  /* ── POST / ─────────────────────────────────────────── */

  /**
   * Tests de POST / — crea un documento.
   */
  describe("POST /", () => {
    /** verifica que crea un documento y retorna status 201 */
    it("should_create_document_and_return_201", async () => {
      // Arrange
      const dto = { title: "New Doc", workspace_id: WORKSPACE_ID };
      document_service.create_document.mockResolvedValue(make_doc_dto());

      // Act
      const { status_code, body, next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(status_code).toBe(201);
      expect(body).toMatchObject({ id: DOCUMENT_ID, title: "Test Doc" });
      expect(document_service.create_document).toHaveBeenCalledWith(dto, USER_ID);
    });

    /** verifica que pasa next(ValidationError) cuando title está vacío */
    it("should_call_next_with_ValidationError_for_empty_title", async () => {
      // Arrange
      const dto = { title: "", workspace_id: WORKSPACE_ID };

      // Act
      const { next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
      expect(document_service.create_document).not.toHaveBeenCalled();
    });

    /** verifica que pasa next(ValidationError) cuando workspace_id no es UUID */
    it("should_call_next_with_ValidationError_for_invalid_workspace_uuid", async () => {
      // Arrange
      const dto = { title: "My Doc", workspace_id: "not-a-uuid" };

      // Act
      const { next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });

    /** verifica que acepta folder_id UUID válido */
    it("should_accept_valid_folder_id_uuid", async () => {
      // Arrange
      const dto = {
        title: "Doc in Folder",
        workspace_id: WORKSPACE_ID,
        folder_id: FOLDER_ID,
      };
      document_service.create_document.mockResolvedValue(make_doc_dto({ folder_id: FOLDER_ID }));

      // Act
      const { next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBeUndefined();
    });

    /** verifica que pasa el error del servicio a next() */
    it("should_pass_service_error_to_next", async () => {
      // Arrange
      const dto = { title: "My Doc", workspace_id: WORKSPACE_ID };
      const forbidden = new ForbiddenError("Not a member");
      document_service.create_document.mockRejectedValue(forbidden);

      // Act
      const { next_error } = await call_route_handler(router, "post", "/", {
        body: dto,
      });

      // Assert
      expect(next_error).toBe(forbidden);
    });
  });

  /* ── GET / ──────────────────────────────────────────── */

  /**
   * Tests de GET / — lista documentos por workspace.
   */
  describe("GET /", () => {
    /** verifica que retorna array plano cuando no hay parámetros de paginación */
    it("should_return_flat_array_without_pagination_params", async () => {
      // Arrange
      const docs = [make_doc_dto(), make_doc_dto({ id: "other-doc" })];
      document_service.list_documents.mockResolvedValue({
        data: docs,
        pagination: { total: 2, limit: 50, offset: 0 },
      });

      // Act
      const { body, next_error } = await call_route_handler(router, "get", "/", {
        query: { workspace_id: WORKSPACE_ID },
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(Array.isArray(body)).toBe(true);
      expect((body as unknown[]).length).toBe(2);
    });

    /** verifica que retorna envelope paginado cuando hay parámetros limit/offset */
    it("should_return_paginated_envelope_with_pagination_params", async () => {
      // Arrange
      document_service.list_documents.mockResolvedValue({
        data: [make_doc_dto()],
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

    /** verifica que pasa next(ValidationError) cuando workspace_id no es UUID */
    it("should_call_next_with_ValidationError_for_invalid_workspace_uuid", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "get", "/", {
        query: { workspace_id: "invalid-uuid" },
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });
  });

  /* ── GET /shared ───────────────────────────────────── */

  describe("GET /shared", () => {
    it("should_return_shared_documents_for_current_user", async () => {
      // Arrange
      document_service.list_shared_documents.mockResolvedValue({
        data: [make_doc_dto({ id: "shared-doc" })],
        pagination: { total: 1, limit: 50, offset: 0 },
      });

      // Act
      const { body, next_error } = await call_route_handler(router, "get", "/shared", {
        query: {},
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(Array.isArray(body)).toBe(true);
      expect(document_service.list_shared_documents).toHaveBeenCalledWith(USER_ID, {
        limit: 50,
        offset: 0,
      });
    });
  });

  /* ── GET /:id ───────────────────────────────────────── */

  /**
   * Tests de GET /:id — obtiene un documento por ID.
   */
  describe("GET /:id", () => {
    /** verifica que retorna el documento cuando el ID es válido */
    it("should_return_document_for_valid_uuid_id", async () => {
      // Arrange
      document_service.get_document.mockResolvedValue(make_doc_dto());

      // Act
      const { body, next_error } = await call_route_handler(router, "get", "/:id", {
        params: { id: DOCUMENT_ID },
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(body).toMatchObject({ id: DOCUMENT_ID });
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

    /** verifica que pasa next(NotFoundError) cuando el servicio lanza NotFoundError */
    it("should_pass_NotFoundError_from_service_to_next", async () => {
      // Arrange
      document_service.get_document.mockRejectedValue(new NotFoundError("Document not found"));

      // Act
      const { next_error } = await call_route_handler(router, "get", "/:id", {
        params: { id: DOCUMENT_ID },
      });

      // Assert
      expect(next_error).toBeInstanceOf(NotFoundError);
    });
  });

  /* ── PATCH /:id ─────────────────────────────────────── */

  /**
   * Tests de PATCH /:id — actualiza un documento.
   */
  describe("PATCH /:id", () => {
    /** verifica que actualiza el documento y retorna status 200 */
    it("should_update_document_and_return_200", async () => {
      // Arrange
      document_service.update_document.mockResolvedValue(make_doc_dto({ title: "Updated" }));

      // Act
      const { body, next_error } = await call_route_handler(router, "patch", "/:id", {
        params: { id: DOCUMENT_ID },
        body: { title: "Updated" },
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect((body as { title: string }).title).toBe("Updated");
    });

    /** verifica que pasa next(ValidationError) cuando title es cadena vacía */
    it("should_call_next_with_ValidationError_for_empty_title", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "patch", "/:id", {
        params: { id: DOCUMENT_ID },
        body: { title: "" },
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
    });

    /** verifica que acepta patch sin title (sólo content_json) */
    it("should_accept_patch_without_title", async () => {
      // Arrange
      document_service.update_document.mockResolvedValue(make_doc_dto());

      // Act
      const { next_error } = await call_route_handler(router, "patch", "/:id", {
        params: { id: DOCUMENT_ID },
        body: { content_json: { type: "doc", content: [] } },
      });

      // Assert
      expect(next_error).toBeUndefined();
    });
  });

  /* ── DELETE /:id ────────────────────────────────────── */

  /**
   * Tests de DELETE /:id — borra suavemente un documento.
   */
  describe("DELETE /:id", () => {
    /** verifica que borra el documento y retorna status 204 */
    it("should_delete_document_and_return_204", async () => {
      // Arrange
      document_service.delete_document.mockResolvedValue(undefined);

      // Act
      const { next_error } = await call_route_handler(router, "delete", "/:id", {
        params: { id: DOCUMENT_ID },
      });

      // Assert
      expect(next_error).toBeUndefined();
      expect(document_service.delete_document).toHaveBeenCalledWith(DOCUMENT_ID, USER_ID);
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
  });

  /* ── POST /:id/invite ───────────────────────────────── */

  /**
   * Tests de POST /:id/invite — invita colaboradores por email.
   */
  describe("POST /:id/invite", () => {
    /** verifica que invita por email y retorna status 201 */
    it("should_invite_collaborator_and_return_201", async () => {
      // Arrange
      document_service.invite_document_collaborator.mockResolvedValue({
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
          params: { id: DOCUMENT_ID },
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
      expect(document_service.invite_document_collaborator).toHaveBeenCalledWith(
        DOCUMENT_ID,
        "juan@nombre.es",
        USER_ID,
      );
    });

    /** verifica que valida email faltante */
    it("should_call_next_with_ValidationError_for_missing_email", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "post", "/:id/invite", {
        params: { id: DOCUMENT_ID },
        body: {},
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
      expect(document_service.invite_document_collaborator).not.toHaveBeenCalled();
    });

    /** verifica que valida formato de email */
    it("should_call_next_with_ValidationError_for_invalid_email", async () => {
      // Arrange & Act
      const { next_error } = await call_route_handler(router, "post", "/:id/invite", {
        params: { id: DOCUMENT_ID },
        body: { email: "not-an-email" },
      });

      // Assert
      expect(next_error).toBeInstanceOf(ValidationError);
      expect(document_service.invite_document_collaborator).not.toHaveBeenCalled();
    });

    /** verifica que pasa errores del servicio a next() */
    it("should_pass_service_error_to_next", async () => {
      // Arrange
      const not_found_error = new NotFoundError("User with this email does not exist in Caret");
      document_service.invite_document_collaborator.mockRejectedValue(not_found_error);

      // Act
      const { next_error } = await call_route_handler(router, "post", "/:id/invite", {
        params: { id: DOCUMENT_ID },
        body: { email: "missing@nombre.es" },
      });

      // Assert
      expect(next_error).toBe(not_found_error);
    });
  });
});
