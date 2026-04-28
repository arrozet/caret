import express, { type Express } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorMiddleware } from "../../src/middleware/error_middleware.js";
import { UnauthorizedError } from "../../src/lib/errors.js";

/**
 * Integration tests for auth-service HTTP surface.
 * Validates that the app contract exposed to infra and clients is stable.
 */
describe("auth-service integration", () => {
  let baseUrl = "";
  let closeServer: (() => void) | null = null;

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
      res.json({ status: "ok", service: "auth-service" });
    });
    app.get("/protected", () => {
      throw new UnauthorizedError("token required");
    });
    app.get("/crash", () => {
      throw new Error("boom");
    });
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
    expect(body).toEqual({ status: "ok", service: "auth-service" });
  });

  /**
   * Verifies that domain AppError exceptions are translated to HTTP status and body.
   */
  it("GET /protected should_return_401_when_app_error_is_thrown", async () => {
    // Arrange

    // Act
    const response = await fetch(`${baseUrl}/protected`);
    const body = (await response.json()) as { error: string };

    // Assert
    expect(response.status).toBe(401);
    expect(body.error).toBe("token required");
  });

  /**
   * Verifies that unknown exceptions are normalized as internal server errors.
   */
  it("GET /crash should_return_500_with_generic_error", async () => {
    // Arrange

    // Act
    const response = await fetch(`${baseUrl}/crash`);
    const body = (await response.json()) as { error: string };

    // Assert
    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });
});
