import { describe, it, expect } from "vitest";

/**
 * Smoke tests for the API Gateway configuration module.
 * Validates that config defaults are sane when no env vars are set.
 */
describe("api-gateway config", () => {
  it("should export default port 3000", async () => {
    const { config } = await import("../../src/lib/config.js");
    expect(config.PORT).toBe(3000);
  });

  it("should have default downstream service URLs", async () => {
    const { config } = await import("../../src/lib/config.js");
    expect(config.AUTH_SERVICE_URL).toBe("http://localhost:3001");
    expect(config.DOCUMENT_SERVICE_URL).toBe("http://localhost:3002");
    expect(config.AI_SERVICE_URL).toBe("http://localhost:8000");
  });

  it("should default ALLOWED_ORIGINS to localhost:5173", async () => {
    const { config } = await import("../../src/lib/config.js");
    expect(config.ALLOWED_ORIGINS).toContain("http://localhost:5173");
  });
});
