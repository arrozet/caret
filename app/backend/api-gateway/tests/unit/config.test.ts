import { describe, it, expect } from "vitest";

/**
 * Smoke tests for the API Gateway configuration module.
 * Validates that config defaults are sane when no env vars are set.
 */
describe("api-gateway config", () => {
  it("exports default port 3000", async () => {
    const { config } = await import("../../src/lib/config.js");
    expect(config.port).toBe(3000);
  });

  it("has default downstream service URLs", async () => {
    const { config } = await import("../../src/lib/config.js");
    expect(config.authServiceUrl).toBe("http://localhost:3001");
    expect(config.documentServiceUrl).toBe("http://localhost:3002");
    expect(config.aiServiceUrl).toBe("http://localhost:8000");
  });

  it("defaults allowed origins to localhost:5173", async () => {
    const { config } = await import("../../src/lib/config.js");
    expect(config.allowedOrigins).toContain("http://localhost:5173");
  });
});
