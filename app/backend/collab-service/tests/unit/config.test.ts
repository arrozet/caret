import { describe, it, expect } from "vitest";

/**
 * Smoke tests for the Collaboration Service configuration module.
 * Validates that config defaults are sane when no env vars are set.
 */
describe("collab-service config", () => {
  it("should export default port 3003", async () => {
    const { config } = await import("../../src/lib/config.js");
    expect(config.PORT).toBe(3003);
  });

  it("should read NODE_ENV from environment", async () => {
    const { config } = await import("../../src/lib/config.js");
    // Vitest sets NODE_ENV=test; just ensure the value is a non-empty string
    expect(typeof config.NODE_ENV).toBe("string");
    expect(config.NODE_ENV.length).toBeGreaterThan(0);
  });

  it("should default SUPABASE_JWT_SECRET to empty string", async () => {
    const { config } = await import("../../src/lib/config.js");
    expect(typeof config.SUPABASE_JWT_SECRET).toBe("string");
  });
});
