import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentService } from "../../src/services/document_service.js";
import { createDocumentRoutes } from "../../src/routes/document_routes.js";
import { errorMiddleware } from "../../src/middleware/error_middleware.js";
import { NotFoundError, UnauthorizedError } from "../../src/lib/errors.js";

/**
 * Integration tests for document-service HTTP routing.
 * Validates route wiring, auth guard behavior, and request validation.
 */
describe("document-service integration", () => {
  let baseUrl = "";
  let closeServer: (() => void) | null = null;
  const authHeaders = { Authorization: "Bearer test-token", "Content-Type": "application/json" };

  const mockDocumentService = {
    createDocument: vi.fn(),
    getDocument: vi.fn(),
    listDocuments: vi.fn(),
    listSharedDocuments: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
    inviteDocumentCollaborator: vi.fn(),
  } as unknown as DocumentService;

  /**
   * Starts an Express app on a random free port for HTTP-level assertions.
   */
  const startApp = (app: Express): Promise<{ baseUrl: string; close: () => void }> =>
    new Promise((resolve) => {
      const server = app.listen(0, () => {
        const address = server.address() as { port: number };
        resolve({
          baseUrl: `http://127.0.0.1:${address.port}`,
          close: () => server.close(),
        });
      });
    });

  beforeAll(async () => {
    // Arrange
    const app = express();
    app.use(express.json());
    app.get("/health", (_req, res) => {
      res.json({ status: "ok", service: "document-service" });
    });

    app.use("/documents", (req: Request, _res: Response, next: NextFunction) => {
      if (!req.headers.authorization?.startsWith("Bearer ")) {
        next(new UnauthorizedError("Missing or malformed Authorization header"));
        return;
      }

      req.auth_user = {
        aud: "authenticated",
        exp: 4_102_444_800,
        iat: 1_700_000_000,
        role: "authenticated",
        sub: "11111111-1111-1111-1111-111111111111",
      };
      next();
    });

    app.use("/documents", createDocumentRoutes(mockDocumentService));
    app.use(errorMiddleware);

    // Act
    const appServer = await startApp(app);
    baseUrl = appServer.baseUrl;
    closeServer = appServer.close;

    // Assert
    expect(baseUrl).toContain("http://127.0.0.1:");
  });

  afterAll(() => {
    closeServer?.();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Verifies that `/health` returns the expected readiness payload.
   */
  it("GET /health should_return_200_with_status_ok", async () => {
    // Arrange

    // Act
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as { status: string; service: string };

    // Assert
    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", service: "document-service" });
  });

  /**
   * Verifies that protected document routes reject anonymous requests.
   */
  it("GET /documents should_return_401_when_missing_bearer_token", async () => {
    // Arrange

    // Act
    const response = await fetch(`${baseUrl}/documents`);
    const body = (await response.json()) as { error: string };

    // Assert
    expect(response.status).toBe(401);
    expect(body.error).toBe("Missing or malformed Authorization header");
  });

  /**
   * Verifies query validation for listing workspace documents.
   */
  it("GET /documents should_return_422_when_workspace_id_is_missing", async () => {
    // Arrange

    // Act
    const response = await fetch(`${baseUrl}/documents`, {
      headers: authHeaders,
    });
    const body = (await response.json()) as { error: string };

    // Assert
    expect(response.status).toBe(422);
    expect(body.error).toBe("workspace_id query parameter is required");
  });

  /**
   * Verifies that valid create requests delegate to DocumentService and return 201.
   */
  it("POST /documents should_create_document_and_return_201", async () => {
    // Arrange
    mockDocumentService.createDocument = vi.fn().mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      title: "Integration document",
    });

    // Act
    const response = await fetch(`${baseUrl}/documents`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        title: "Integration document",
        workspace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    });
    const body = (await response.json()) as { id: string; title: string };

    // Assert
    expect(response.status).toBe(201);
    expect(body.id).toBe("22222222-2222-2222-2222-222222222222");
    expect(mockDocumentService.createDocument).toHaveBeenCalledWith(
      {
        title: "Integration document",
        workspace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
      "11111111-1111-1111-1111-111111111111",
    );
  });

  /**
   * Verifies that list endpoint delegates to service and returns flat data by default.
   */
  it("GET /documents should_list_workspace_documents_without_pagination_envelope", async () => {
    // Arrange
    mockDocumentService.listDocuments = vi.fn().mockResolvedValue({
      data: [{ id: "doc-1", title: "Doc one" }],
      pagination: { limit: 20, offset: 0, total: 1 },
    });

    // Act
    const response = await fetch(
      `${baseUrl}/documents?workspace_id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      { headers: authHeaders },
    );
    const body = (await response.json()) as Array<{ id: string; title: string }>;

    // Assert
    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "doc-1", title: "Doc one" }]);
    expect(mockDocumentService.listDocuments).toHaveBeenCalled();
  });

  /**
   * Verifies paginated list mode when limit/offset are provided.
   */
  it("GET /documents should_return_pagination_envelope_when_limit_or_offset_is_set", async () => {
    // Arrange
    mockDocumentService.listDocuments = vi.fn().mockResolvedValue({
      data: [{ id: "doc-2", title: "Doc two" }],
      pagination: { limit: 10, offset: 0, total: 1 },
    });

    // Act
    const response = await fetch(
      `${baseUrl}/documents?workspace_id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&limit=10`,
      { headers: authHeaders },
    );
    const body = (await response.json()) as {
      data: Array<{ id: string; title: string }>;
      pagination: { limit: number; offset: number; total: number };
    };

    // Assert
    expect(response.status).toBe(200);
    expect(body.pagination.limit).toBe(10);
    expect(body.data[0]?.id).toBe("doc-2");
  });

  /**
   * Verifies GET by id route and service delegation.
   */
  it("GET /documents/:id should_return_document_when_id_is_valid", async () => {
    // Arrange
    const documentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    mockDocumentService.getDocument = vi.fn().mockResolvedValue({
      id: documentId,
      title: "Fetched doc",
    });

    // Act
    const response = await fetch(`${baseUrl}/documents/${documentId}`, { headers: authHeaders });
    const body = (await response.json()) as { id: string; title: string };

    // Assert
    expect(response.status).toBe(200);
    expect(body.id).toBe(documentId);
    expect(mockDocumentService.getDocument).toHaveBeenCalledWith(
      documentId,
      "11111111-1111-1111-1111-111111111111",
    );
  });

  /**
   * Verifies id validation on GET by id route.
   */
  it("GET /documents/:id should_return_422_when_id_is_not_uuid", async () => {
    // Arrange

    // Act
    const response = await fetch(`${baseUrl}/documents/not-a-uuid`, { headers: authHeaders });
    const body = (await response.json()) as { error: string };

    // Assert
    expect(response.status).toBe(422);
    expect(body.error).toContain("id");
  });

  /**
   * Verifies PATCH route delegates updates and returns updated payload.
   */
  it("PATCH /documents/:id should_update_document_and_return_200", async () => {
    // Arrange
    const documentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    mockDocumentService.updateDocument = vi.fn().mockResolvedValue({
      id: documentId,
      title: "Updated title",
    });

    // Act
    const response = await fetch(`${baseUrl}/documents/${documentId}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ title: "Updated title" }),
    });
    const body = (await response.json()) as { id: string; title: string };

    // Assert
    expect(response.status).toBe(200);
    expect(body.title).toBe("Updated title");
    expect(mockDocumentService.updateDocument).toHaveBeenCalledWith(
      documentId,
      { title: "Updated title" },
      "11111111-1111-1111-1111-111111111111",
    );
  });

  /**
   * Verifies DELETE route status code and service delegation.
   */
  it("DELETE /documents/:id should_return_204_on_success", async () => {
    // Arrange
    const documentId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    mockDocumentService.deleteDocument = vi.fn().mockResolvedValue(undefined);

    // Act
    const response = await fetch(`${baseUrl}/documents/${documentId}`, {
      method: "DELETE",
      headers: authHeaders,
    });

    // Assert
    expect(response.status).toBe(204);
    expect(mockDocumentService.deleteDocument).toHaveBeenCalledWith(
      documentId,
      "11111111-1111-1111-1111-111111111111",
    );
  });

  /**
   * Verifies invite endpoint normalizes email and returns created response.
   */
  it("POST /documents/:id/invite should_trim_email_and_return_201", async () => {
    // Arrange
    const documentId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    mockDocumentService.inviteDocumentCollaborator = vi.fn().mockResolvedValue({
      email: "member@example.com",
      role: "viewer",
    });

    // Act
    const response = await fetch(`${baseUrl}/documents/${documentId}/invite`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ email: "  member@example.com  " }),
    });
    const body = (await response.json()) as { email: string };

    // Assert
    expect(response.status).toBe(201);
    expect(body.email).toBe("member@example.com");
    expect(mockDocumentService.inviteDocumentCollaborator).toHaveBeenCalledWith(
      documentId,
      "member@example.com",
      "11111111-1111-1111-1111-111111111111",
    );
  });

  /**
   * Verifies invite payload validation for malformed email.
   */
  it("POST /documents/:id/invite should_return_422_for_invalid_email", async () => {
    // Arrange
    const documentId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

    // Act
    const response = await fetch(`${baseUrl}/documents/${documentId}/invite`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const body = (await response.json()) as { error: string };

    // Assert
    expect(response.status).toBe(422);
    expect(body.error).toContain("email");
  });

  /**
   * Verifies that domain errors from service are propagated by middleware.
   */
  it("GET /documents/:id should_propagate_service_not_found_error_as_404", async () => {
    // Arrange
    const documentId = "abababab-abab-4bab-8bab-abababababab";
    mockDocumentService.getDocument = vi
      .fn()
      .mockRejectedValue(new NotFoundError("Document not found"));

    // Act
    const response = await fetch(`${baseUrl}/documents/${documentId}`, { headers: authHeaders });
    const body = (await response.json()) as { error: string };

    // Assert
    expect(response.status).toBe(404);
    expect(body.error).toBe("Document not found");
  });
});
