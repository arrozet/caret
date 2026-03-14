import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests for the auth-service database client module (`src/db/client.ts`).
 *
 * The client module performs async top-level IPv4 DNS resolution before
 * creating the postgres connection. We mock the `node:dns/promises` module,
 * the `drizzle-orm/postgres-js` module, and the `postgres` driver so no real
 * network or DB calls are made. We validate that:
 *  - When DNS resolution succeeds the resolved IPv4 host is passed to the driver.
 *  - When DNS resolution fails (or returns empty) the driver falls back to the
 *    original connection string without an explicit host override.
 */

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock("node:dns/promises", () => ({
  resolve4: vi.fn(),
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({ _mocked_drizzle: true })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => ({ _mocked_postgres: true })),
}));

vi.mock("../../src/db/schema.js", () => ({}));

vi.mock("../../src/lib/config.js", () => ({
  config: {
    DATABASE_URL: "postgresql://user:pass@db.supabase.co:5432/postgres",
    PORT: 3001,
    NODE_ENV: "test",
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    JWT_SECRET: "",
  },
}));

// ─── tests ────────────────────────────────────────────────────────────────────

describe("db/client — resolve_ipv4_host logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  /**
   * When `resolve4` returns at least one IPv4 address the postgres client must
   * receive that address via the `host` option so connections go through IPv4.
   */
  it("passes resolved IPv4 host to postgres when DNS resolution succeeds", async () => {
    // Arrange
    const { resolve4 } = await import("node:dns/promises");
    vi.mocked(resolve4).mockResolvedValue(["1.2.3.4"]);

    const postgres_mock = await import("postgres");
    const drizzle_mock = await import("drizzle-orm/postgres-js");

    // Act — importing the module triggers the top-level await
    await import("../../src/db/client.js");

    // Assert — postgres must have been called with the resolved host
    expect(postgres_mock.default).toHaveBeenCalledWith(
      "postgresql://user:pass@db.supabase.co:5432/postgres",
      expect.objectContaining({ host: "1.2.3.4" }),
    );
    expect(drizzle_mock.drizzle).toHaveBeenCalledOnce();
  });

  /**
   * When `resolve4` throws (e.g. the hostname cannot be resolved) the module
   * must still construct the postgres client — just without a `host` override.
   */
  it("falls back to default resolution when DNS resolve4 throws", async () => {
    // Arrange
    const { resolve4 } = await import("node:dns/promises");
    vi.mocked(resolve4).mockRejectedValue(new Error("ENOTFOUND"));

    const postgres_mock = await import("postgres");
    const drizzle_mock = await import("drizzle-orm/postgres-js");

    // Act
    await import("../../src/db/client.js");

    // Assert — postgres called without the `host` option override
    const call_args = vi.mocked(postgres_mock.default).mock.calls[0];
    expect(call_args[0]).toBe("postgresql://user:pass@db.supabase.co:5432/postgres");
    expect((call_args[1] as Record<string, unknown>)?.host).toBeUndefined();
    expect(drizzle_mock.drizzle).toHaveBeenCalledOnce();
  });

  /**
   * When `resolve4` returns an empty array the module must fall back to the
   * default resolution path (no `host` override) as there is no address to use.
   */
  it("falls back to default resolution when resolve4 returns an empty array", async () => {
    // Arrange
    const { resolve4 } = await import("node:dns/promises");
    vi.mocked(resolve4).mockResolvedValue([]);

    const postgres_mock = await import("postgres");

    // Act
    await import("../../src/db/client.js");

    // Assert
    const call_args = vi.mocked(postgres_mock.default).mock.calls[0];
    expect((call_args[1] as Record<string, unknown>)?.host).toBeUndefined();
  });

  /**
   * The `db` named export must be the value returned by `drizzle()`, making
   * it available to all Repositories via `import { db } from './client.js'`.
   */
  it("exports db as the result of drizzle()", async () => {
    // Arrange
    const { resolve4 } = await import("node:dns/promises");
    vi.mocked(resolve4).mockResolvedValue(["10.0.0.1"]);
    const drizzle_mock = await import("drizzle-orm/postgres-js");
    const mocked_db = { _mocked_drizzle: true, _id: "test-db" };
    vi.mocked(drizzle_mock.drizzle).mockReturnValue(mocked_db as never);

    // Act
    const { db } = await import("../../src/db/client.js");

    // Assert
    expect(db).toEqual(mocked_db);
  });
});
