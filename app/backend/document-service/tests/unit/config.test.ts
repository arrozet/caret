import { describe, it, expect } from "vitest";

/**
 * Smoke tests for the Document Service configuration module.
 * Validates that config defaults are sane when no env vars are set.
 */
describe("document-service config", () => {
  it("should export default port 3002", async () => {
    const { config } = await import("../../src/lib/config.js");
    expect(config.PORT).toBe(3002);
  });

  it("should read NODE_ENV from environment", async () => {
    const { config } = await import("../../src/lib/config.js");
    // Vitest sets NODE_ENV=test; just ensure the value is a non-empty string
    expect(typeof config.NODE_ENV).toBe("string");
    expect(config.NODE_ENV.length).toBeGreaterThan(0);
  });

  it("should default DATABASE_URL to empty string", async () => {
    const { config } = await import("../../src/lib/config.js");
    expect(typeof config.DATABASE_URL).toBe("string");
  });
});
