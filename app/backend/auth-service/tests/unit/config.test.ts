import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests for the auth-service centralized configuration module
 * (`src/lib/config.ts`).
 *
 * Validates that each config key is read from the correct environment variable,
 * that numeric conversion works for PORT, and that sensible defaults are used
 * when variables are absent.
 */

describe("config", () => {
  /** Save and restore env vars around each test. */
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // ─── PORT ────────────────────────────────────────────────────────────────

  /**
   * PORT must be parsed as a number so Express can use it without further
   * coercion. When absent it should fall back to 3001.
   */
  describe("PORT", () => {
    it("defaults to 3001 when PORT env var is not set", async () => {
      // Arrange
      vi.stubEnv("PORT", "");

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.PORT).toBe(3001);
    });

    it("parses PORT as a number from the environment", async () => {
      // Arrange
      vi.stubEnv("PORT", "4000");

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.PORT).toBe(4000);
      expect(typeof config.PORT).toBe("number");
    });
  });

  // ─── NODE_ENV ─────────────────────────────────────────────────────────────

  describe("NODE_ENV", () => {
    it("defaults to 'development' when NODE_ENV is not set", async () => {
      // Arrange
      vi.stubEnv("NODE_ENV", "");

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.NODE_ENV).toBe("development");
    });

    it("reads the NODE_ENV value from environment", async () => {
      // Arrange
      vi.stubEnv("NODE_ENV", "production");

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.NODE_ENV).toBe("production");
    });
  });

  // ─── DATABASE_URL ─────────────────────────────────────────────────────────

  describe("DATABASE_URL", () => {
    it("defaults to an empty string when DATABASE_URL is not set", async () => {
      // Arrange
      vi.stubEnv("DATABASE_URL", "");

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.DATABASE_URL).toBe("");
    });

    it("reads DATABASE_URL from environment", async () => {
      // Arrange
      const url = "postgresql://user:pass@localhost:5432/testdb";
      vi.stubEnv("DATABASE_URL", url);

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.DATABASE_URL).toBe(url);
    });
  });

  // ─── SUPABASE_URL ─────────────────────────────────────────────────────────

  describe("SUPABASE_URL", () => {
    it("defaults to empty string when SUPABASE_URL is not set", async () => {
      // Arrange
      vi.stubEnv("SUPABASE_URL", "");

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.SUPABASE_URL).toBe("");
    });

    it("reads SUPABASE_URL from environment", async () => {
      // Arrange
      vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.SUPABASE_URL).toBe("https://project.supabase.co");
    });
  });

  // ─── SUPABASE_ANON_KEY ────────────────────────────────────────────────────

  describe("SUPABASE_ANON_KEY", () => {
    it("defaults to empty string when SUPABASE_ANON_KEY is not set", async () => {
      // Arrange
      vi.stubEnv("SUPABASE_ANON_KEY", "");

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.SUPABASE_ANON_KEY).toBe("");
    });

    it("reads SUPABASE_ANON_KEY from environment", async () => {
      // Arrange
      const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test";
      vi.stubEnv("SUPABASE_ANON_KEY", key);

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.SUPABASE_ANON_KEY).toBe(key);
    });
  });

  // ─── SUPABASE_SERVICE_ROLE_KEY ────────────────────────────────────────────

  describe("SUPABASE_SERVICE_ROLE_KEY", () => {
    it("defaults to empty string when SUPABASE_SERVICE_ROLE_KEY is not set", async () => {
      // Arrange
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.SUPABASE_SERVICE_ROLE_KEY).toBe("");
    });

    it("reads SUPABASE_SERVICE_ROLE_KEY from environment", async () => {
      // Arrange
      const key = "service-role-key-value";
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", key);

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.SUPABASE_SERVICE_ROLE_KEY).toBe(key);
    });
  });

  // ─── JWT_SECRET ───────────────────────────────────────────────────────────

  describe("JWT_SECRET", () => {
    it("defaults to empty string when JWT_SECRET is not set", async () => {
      // Arrange
      vi.stubEnv("JWT_SECRET", "");

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.JWT_SECRET).toBe("");
    });

    it("reads JWT_SECRET from environment", async () => {
      // Arrange
      const secret = "super-secret-key-for-testing";
      vi.stubEnv("JWT_SECRET", secret);

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      expect(config.JWT_SECRET).toBe(secret);
    });
  });

  // ─── shape ────────────────────────────────────────────────────────────────

  /**
   * All expected keys must be present on the config object so that modules
   * using destructuring or property access always find the key (even if empty).
   */
  describe("config object shape", () => {
    it("exposes all required config keys", async () => {
      // Arrange — no setup needed

      // Act
      const { config } = await import("../../src/lib/config.js");

      // Assert
      const keys = Object.keys(config);
      expect(keys).toContain("PORT");
      expect(keys).toContain("NODE_ENV");
      expect(keys).toContain("DATABASE_URL");
      expect(keys).toContain("SUPABASE_URL");
      expect(keys).toContain("SUPABASE_ANON_KEY");
      expect(keys).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(keys).toContain("JWT_SECRET");
    });
  });
});
