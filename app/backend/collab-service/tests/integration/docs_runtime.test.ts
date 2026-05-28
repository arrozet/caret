import { afterEach, describe, expect, it } from "vitest";
import { createCollaborationServer, type CollaborationServer } from "../../src/app.js";

/**
 * Integration tests for collaboration service documentation endpoints.
 * Validates that the WebSocket AsyncAPI docs are served by the shared HTTP server.
 */
describe("collaboration docs runtime", () => {
  let server: CollaborationServer | null = null;

  afterEach(async () => {
    // Arrange
    const currentServer = server;
    server = null;

    // Act
    await new Promise<void>((resolve) => currentServer?.close(resolve) ?? resolve());

    // Assert
    expect(currentServer).toBeTruthy();
  });

  /** Verifies that /docs returns the human-readable AsyncAPI page. */
  it("serves asyncapi html docs from /docs", async () => {
    // Arrange
    server = createCollaborationServer();
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address();
    const url = `http://127.0.0.1:${address?.port}/docs`;

    // Act
    const response = await fetch(url);
    const html = await response.text();

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Caret Collaboration Service");
    expect(html).toContain("AsyncApiStandalone.render");
    expect(html).toContain("@asyncapi/react-component");
  });

  /** Verifies that browser-normalized /docs/ also returns the docs page. */
  it("serves asyncapi html docs from /docs trailing slash", async () => {
    // Arrange
    server = createCollaborationServer();
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address();
    const url = `http://127.0.0.1:${address?.port}/docs/`;

    // Act
    const response = await fetch(url);
    const html = await response.text();

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Caret Collaboration Service");
    expect(html).toContain("AsyncApiStandalone.render");
    expect(html).toContain("@asyncapi/react-component");
  });

  /** Verifies that /asyncapi.json returns the machine-readable WebSocket spec. */
  it("serves asyncapi json from /asyncapi.json", async () => {
    // Arrange
    server = createCollaborationServer();
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address();
    const url = `http://127.0.0.1:${address?.port}/asyncapi.json`;

    // Act
    const response = await fetch(url);
    const body = (await response.json()) as {
      asyncapi?: string;
      channels?: Record<string, unknown>;
    };

    // Assert
    expect(response.status).toBe(200);
    expect(body.asyncapi).toBe("2.6.0");
    expect(body.channels).toHaveProperty("document/{doc_id}");
  });
});
