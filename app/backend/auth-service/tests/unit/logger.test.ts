import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../../src/lib/logger.js";

/**
 * Unit tests for the auth-service structured JSON logger (`src/lib/logger.ts`).
 *
 * Validates that every log-level helper writes exactly one valid JSON line to
 * stdout with the correct `level`, `message`, and `timestamp` fields, and that
 * optional `meta` objects are spread into the top-level output object so they
 * can be indexed by log-aggregation tools.
 */
describe("logger", () => {
  let console_spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Silence real console output and capture calls for assertions.
    console_spy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Parse the first captured console.log argument as a JSON object. */
  const get_output = (): Record<string, unknown> =>
    JSON.parse(console_spy.mock.calls[0][0] as string);

  // ─── log levels ───────────────────────────────────────────────────────────

  /**
   * Each helper method must stamp its own severity name so CloudWatch and
   * other log-aggregation tools can filter by level.
   */
  describe("log levels", () => {
    it("logger.info sets the level field to 'info'", () => {
      // Arrange
      const message = "info message";

      // Act
      logger.info(message);

      // Assert
      expect(get_output().level).toBe("info");
    });

    it("logger.warn sets the level field to 'warn'", () => {
      // Arrange
      const message = "warn message";

      // Act
      logger.warn(message);

      // Assert
      expect(get_output().level).toBe("warn");
    });

    it("logger.error sets the level field to 'error'", () => {
      // Arrange
      const message = "error message";

      // Act
      logger.error(message);

      // Assert
      expect(get_output().level).toBe("error");
    });

    it("logger.debug sets the level field to 'debug'", () => {
      // Arrange
      const message = "debug message";

      // Act
      logger.debug(message);

      // Assert
      expect(get_output().level).toBe("debug");
    });
  });

  // ─── message field ────────────────────────────────────────────────────────

  /** The caller's message must appear verbatim so operators can search logs. */
  describe("message field", () => {
    it("includes the exact message string passed by the caller", () => {
      // Arrange
      const message = "hello auth service";

      // Act
      logger.info(message);

      // Assert
      expect(get_output().message).toBe(message);
    });
  });

  // ─── timestamp field ──────────────────────────────────────────────────────

  /**
   * Every log line must carry an ISO 8601 timestamp so CloudWatch can sort
   * and correlate events across services.
   */
  describe("timestamp field", () => {
    it("includes a non-empty timestamp string", () => {
      // Arrange — no setup needed

      // Act
      logger.info("ts test");

      // Assert
      const { timestamp } = get_output();
      expect(typeof timestamp).toBe("string");
      expect((timestamp as string).length).toBeGreaterThan(0);
    });

    it("timestamp is a parseable ISO 8601 date", () => {
      // Arrange — no setup needed

      // Act
      logger.info("iso check");

      // Assert
      const parsed = new Date(get_output().timestamp as string);
      expect(isNaN(parsed.getTime())).toBe(false);
    });
  });

  // ─── meta spreading ───────────────────────────────────────────────────────

  /**
   * Callers pass structured context (user IDs, reasons, etc.) via the `meta`
   * argument. Fields must appear at the top level so indexers pick them up.
   */
  describe("meta object spreading", () => {
    it("spreads all meta fields into the top-level output object", () => {
      // Arrange
      const meta = { user_id: "u-1", reason: "bad token" };

      // Act
      logger.error("auth failure", meta);

      // Assert
      const out = get_output();
      expect(out.user_id).toBe("u-1");
      expect(out.reason).toBe("bad token");
    });

    it("outputs exactly three root keys when no meta is provided", () => {
      // Arrange — call without a meta argument

      // Act
      logger.debug("no meta");

      // Assert
      const keys = Object.keys(get_output()).sort();
      expect(keys).toEqual(["level", "message", "timestamp"].sort());
    });
  });

  // ─── output format ────────────────────────────────────────────────────────

  /**
   * The implementation must write exactly one console.log call per invocation
   * and produce valid JSON so downstream parsing pipelines do not break.
   */
  describe("output format", () => {
    it("calls console.log exactly once per log statement", () => {
      // Arrange — spy already set up in beforeEach

      // Act
      logger.warn("single call");

      // Assert
      expect(console_spy).toHaveBeenCalledTimes(1);
    });

    it("output is valid JSON-parseable text", () => {
      // Arrange — no setup needed

      // Act
      logger.info("json check");

      // Assert
      const raw = console_spy.mock.calls[0][0] as string;
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });
});
