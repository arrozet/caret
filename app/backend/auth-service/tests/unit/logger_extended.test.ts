import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../../src/lib/logger.js";

/**
 * Extended unit tests for the structured JSON logger.
 * Covers: meta with nested objects, meta with numeric/boolean values,
 * empty-string messages, special characters, and multiple consecutive calls.
 */
describe("logger — extended coverage", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Parse the i-th captured console.log call as JSON. */
  const get_output = (index = 0): Record<string, unknown> =>
    JSON.parse(consoleSpy.mock.calls[index][0] as string);

  // ─── meta with various value types ────────────────────────────────────────

  /**
   * Meta values may include numbers, booleans, or nested objects.
   * All must be serialised correctly by JSON.stringify.
   */
  it("spreads numeric meta values into the output", () => {
    // Arrange
    const meta = { request_id: 42, latency_ms: 3.14 };

    // Act
    logger.info("perf", meta);

    // Assert
    const out = get_output();
    expect(out.request_id).toBe(42);
    expect(out.latency_ms).toBe(3.14);
  });

  it("spreads boolean meta values into the output", () => {
    // Arrange
    const meta = { success: true, retried: false };

    // Act
    logger.info("result", meta);

    // Assert
    const out = get_output();
    expect(out.success).toBe(true);
    expect(out.retried).toBe(false);
  });

  // ─── empty message ────────────────────────────────────────────────────────

  /**
   * An empty string message must not throw and must appear verbatim in the
   * output so downstream parsers do not receive a missing field.
   */
  it("handles an empty string message without throwing", () => {
    // Act & Assert
    expect(() => logger.info("")).not.toThrow();
    expect(get_output().message).toBe("");
  });

  // ─── special characters in message ───────────────────────────────────────

  /**
   * Messages with quotes, backslashes or newlines must be properly escaped
   * by JSON.stringify so the output remains valid JSON.
   */
  it("escapes special characters in the message", () => {
    // Arrange
    const special = 'has "quotes" and \\backslash\\';

    // Act
    logger.warn(special);

    // Assert — parsing would fail if escaping is wrong
    expect(() => get_output()).not.toThrow();
    expect(get_output().message).toBe(special);
  });

  // ─── multiple consecutive calls ───────────────────────────────────────────

  /**
   * Calling the logger multiple times must produce one console.log per call
   * (not batched or dropped).
   */
  it("produces one console.log call per invocation when called three times", () => {
    // Act
    logger.info("first");
    logger.warn("second");
    logger.error("third");

    // Assert
    expect(consoleSpy).toHaveBeenCalledTimes(3);

    expect(get_output(0).message).toBe("first");
    expect(get_output(1).message).toBe("second");
    expect(get_output(2).message).toBe("third");
  });

  // ─── meta does not override core fields ──────────────────────────────────

  /**
   * If meta contains a key that collides with a core field (e.g. "level"),
   * the spread means the meta value wins. We document this behaviour rather
   * than assert it should be blocked, because the logger does a simple spread.
   */
  it("meta spread happens after core fields (meta can override level if key collides)", () => {
    // Arrange — meta with a colliding key
    const meta = { level: "CUSTOM" };

    // Act
    logger.debug("collision", meta);

    // Assert — meta.level overwrites the core level field
    const out = get_output();
    expect(out.level).toBe("CUSTOM");
  });

  // ─── timestamp is close to now ────────────────────────────────────────────

  /**
   * The timestamp in the log output must represent a time within 5 seconds
   * of the current test execution time so that log entries are not stale.
   */
  it("timestamp is within 5 seconds of the current time", () => {
    // Arrange
    const before = Date.now();

    // Act
    logger.info("time check");

    // Assert
    const after = Date.now();
    const ts = new Date(get_output().timestamp as string).getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 5000);
    expect(ts).toBeLessThanOrEqual(after + 5000);
  });

  // ─── each level uses correct level string ─────────────────────────────────

  /**
   * Consolidated assertion: each level helper sets the `level` field to its
   * own name. This complements the per-level tests in logger.test.ts.
   */
  it.each([
    ["info", () => logger.info("x")],
    ["warn", () => logger.warn("x")],
    ["error", () => logger.error("x")],
    ["debug", () => logger.debug("x")],
  ] as const)("level '%s' produces correct level field", (expected_level, call_fn) => {
    // Act
    call_fn();

    // Assert
    expect(get_output().level).toBe(expected_level);
    consoleSpy.mockClear();
  });
});
