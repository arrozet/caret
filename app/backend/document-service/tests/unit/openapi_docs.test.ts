import { describe, expect, it, vi } from "vitest";
import type { Express, Request, Response } from "express";
import { registerOpenApiDocs } from "../../src/openapi/openapi_docs.js";

/**
 * Unit tests for OpenAPI docs registration. Validates that generated specs
 * are exposed as JSON and that Swagger UI is mounted for humans.
 */
describe("registerOpenApiDocs", () => {
  /** Verifies the OpenAPI JSON route and Swagger UI mount path. */
  it("registers openapi json and swagger ui routes", () => {
    // Arrange
    const app = { get: vi.fn(), use: vi.fn() };
    const spec = { openapi: "3.0.0", info: { title: "Caret", version: "0.1.0" } };

    // Act
    registerOpenApiDocs(app as unknown as Express, spec);

    // Assert
    expect(app.get).toHaveBeenCalledWith("/openapi.json", expect.any(Function));
    expect(app.use).toHaveBeenCalledWith("/docs", expect.any(Array), expect.any(Function));
  });

  /** Verifies that the JSON handler returns the provided immutable spec object. */
  it("returns the provided openapi spec from the json handler", () => {
    // Arrange
    const app = { get: vi.fn(), use: vi.fn() };
    const spec = { openapi: "3.0.0", info: { title: "Caret", version: "0.1.0" } };
    const response = { json: vi.fn() } as unknown as Response;

    // Act
    registerOpenApiDocs(app as unknown as Express, spec);
    const [, handler] = app.get.mock.calls[0] as [string, (req: Request, res: Response) => void];
    handler({} as Request, response);

    // Assert
    expect(response.json).toHaveBeenCalledWith(spec);
  });
});
