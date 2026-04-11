import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../../src/lib/logger.js";

/**
 * Unit tests for the structured JSON logger (`src/lib/logger.ts`).
 *
 * Validates that every log method writes a single, valid JSON line to stdout
 * containing the expected `level`, `message`, and `timestamp` fields, and that
 * optional `meta` objects are correctly spread into the top-level output.
 */
describe("logger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Silence real console output during the test run.
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Parse the first console.log call argument as a JSON object. */
  const getOutput = (): Record<string, unknown> =>
    JSON.parse(consoleSpy.mock.calls[0][0] as string);

  // ─── log levels ───────────────────────────────────────────────────────────

  /**
   * Each log-level helper must stamp its own level name into the output so that
   * log-aggregation tools (CloudWatch, Datadog) can filter by severity.
   */
  describe("log levels", () => {
    it("logger.info sets the level field to 'info'", () => {
      // Arrange
      const message = "info message";

      // Act
      logger.info(message);

      // Assert
      expect(getOutput().level).toBe("info");
    });

    it("logger.warn sets the level field to 'warn'", () => {
      // Arrange
      const message = "warn message";

      // Act
      logger.warn(message);

      // Assert
      expect(getOutput().level).toBe("warn");
    });

    it("logger.error sets the level field to 'error'", () => {
      // Arrange
      const message = "error message";

      // Act
      logger.error(message);

      // Assert
      expect(getOutput().level).toBe("error");
    });

    it("logger.debug sets the level field to 'debug'", () => {
      // Arrange
      const message = "debug message";

      // Act
      logger.debug(message);

      // Assert
      expect(getOutput().level).toBe("debug");
    });
  });

  // ─── message field ────────────────────────────────────────────────────────

  /**
   * The caller's message string must appear verbatim in the output so that
   * operators can search logs by exact text.
   */
  describe("message field", () => {
    it("includes the exact message string passed by the caller", () => {
      // Arrange
      const message = "hello world";

      // Act
      logger.info(message);

      // Assert
      expect(getOutput().message).toBe(message);
    });

    it("handles an empty string message without throwing", () => {
      // Arrange — empty string is a valid edge case

      // Act
      logger.info("");

      // Assert
      expect(getOutput().message).toBe("");
    });
  });

  // ─── timestamp field ──────────────────────────────────────────────────────

  /**
   * Every log line must carry an ISO 8601 timestamp so CloudWatch can sort
   * and correlate log events across services.
   */
  describe("timestamp field", () => {
    it("includes a non-empty timestamp string", () => {
      // Arrange — no setup needed

      // Act
      logger.info("ts test");

      // Assert
      const { timestamp } = getOutput();
      expect(typeof timestamp).toBe("string");
      expect((timestamp as string).length).toBeGreaterThan(0);
    });

    it("timestamp is a parseable ISO 8601 date", () => {
      // Arrange — no setup needed

      // Act
      logger.info("iso check");

      // Assert
      const parsed = new Date(getOutput().timestamp as string);
      expect(isNaN(parsed.getTime())).toBe(false);
    });
  });

  // ─── meta spreading ───────────────────────────────────────────────────────

  /**
   * Callers can pass a `meta` object to attach structured context (request IDs,
   * user IDs, etc.) alongside the message. Meta fields must appear at the top
   * level so they are indexed by log aggregators.
   */
  describe("meta object spreading", () => {
    it("spreads all meta fields into the top-level output object", () => {
      // Arrange
      const meta = { userId: "abc", action: "login" };

      // Act
      logger.info("with meta", meta);

      // Assert
      const out = getOutput();
      expect(out.userId).toBe("abc");
      expect(out.action).toBe("login");
    });

    it("outputs exactly three root keys when no meta is provided", () => {
      // Arrange — call without a meta argument

      // Act
      logger.info("no meta");

      // Assert
      const keys = Object.keys(getOutput()).sort();
      expect(keys).toEqual(["level", "message", "timestamp"].sort());
    });
  });

  // ─── output format ────────────────────────────────────────────────────────

  /**
   * The implementation writes exactly one console.log call per invocation
   * and produces a valid JSON string so downstream pipelines can parse it.
   */
  describe("output format", () => {
    it("calls console.log exactly once per log statement", () => {
      // Arrange — spy already set up in beforeEach

      // Act
      logger.error("one call");

      // Assert
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it("output is valid JSON-parseable text", () => {
      // Arrange — no setup needed

      // Act
      logger.debug("json test");

      // Assert
      const raw = consoleSpy.mock.calls[0][0] as string;
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  });
});
