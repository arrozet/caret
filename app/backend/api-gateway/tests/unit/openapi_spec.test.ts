import { describe, expect, it } from "vitest";
import openApiSpec from "../../src/openapi/swagger.json" with { type: "json" };

/**
 * Unit tests for the generated API Gateway OpenAPI spec. Validates that the
 * public gateway docs list the frontend-facing REST endpoints, not only proxy roots.
 */
describe("api gateway openapi spec", () => {
  /** Verifies that the generated docs include the editor REST surface. */
  it("documents the public document, workspace, and folder endpoints", () => {
    // Arrange
    const paths = openApiSpec.paths;

    // Act & Assert
    expect(paths).toHaveProperty("/api/v1/documents");
    expect(paths).toHaveProperty("/api/v1/documents/{id}");
    expect(paths).toHaveProperty("/api/v1/documents/{id}/invite");
    expect(paths).toHaveProperty("/api/v1/workspaces");
    expect(paths).toHaveProperty("/api/v1/workspaces/{id}");
    expect(paths).toHaveProperty("/api/v1/workspaces/{id}/invite");
    expect(paths).toHaveProperty("/api/v1/folders");
    expect(paths).toHaveProperty("/api/v1/folders/all");
    expect(paths).toHaveProperty("/api/v1/folders/{id}");
  });

  /** Verifies that the generated docs include frontend-facing AI endpoints. */
  it("documents the public AI endpoints behind the gateway", () => {
    // Arrange
    const paths = openApiSpec.paths;

    // Act & Assert
    expect(paths).toHaveProperty("/api/v1/ai/models");
    expect(paths).toHaveProperty("/api/v1/ai/conversations");
    expect(paths).toHaveProperty("/api/v1/ai/conversations/{conversation_id}");
    expect(paths).toHaveProperty("/api/v1/ai/conversations/{conversation_id}/messages");
    expect(paths).toHaveProperty("/api/v1/ai/conversations/{conversation_id}/stream");
    expect(paths).toHaveProperty("/api/v1/ai/conversations/{conversation_id}/touch");
    expect(paths).toHaveProperty("/api/v1/ai/suggestions/{suggestion_id}/status");
    expect(paths).toHaveProperty("/api/v1/ai/embeddings/index");
  });
});
