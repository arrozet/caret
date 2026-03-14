import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../../src/lib/logger.js";

/**
 * Unit tests for the structured logger module.
 * Verifica que cada nivel de log emita JSON válido con los campos correctos
 * y que los metadatos opcionales sean incluidos en la salida.
 */
describe("logger", () => {
  let console_spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Captura la salida de console.log para inspeccionar el JSON emitido
    console_spy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Verifica que logger.info emita JSON con level="info" y el mensaje correcto */
  it("should_emit_info_level_json", () => {
    // Arrange
    const test_message = "test info message";

    // Act
    logger.info(test_message);

    // Assert
    expect(console_spy).toHaveBeenCalledOnce();
    const emitted = JSON.parse(console_spy.mock.calls[0][0] as string);
    expect(emitted.level).toBe("info");
    expect(emitted.message).toBe(test_message);
  });

  /** Verifica que logger.warn emita JSON con level="warn" */
  it("should_emit_warn_level_json", () => {
    // Arrange
    const test_message = "test warn message";

    // Act
    logger.warn(test_message);

    // Assert
    expect(console_spy).toHaveBeenCalledOnce();
    const emitted = JSON.parse(console_spy.mock.calls[0][0] as string);
    expect(emitted.level).toBe("warn");
    expect(emitted.message).toBe(test_message);
  });

  /** Verifica que logger.error emita JSON con level="error" */
  it("should_emit_error_level_json", () => {
    // Arrange
    const test_message = "test error message";

    // Act
    logger.error(test_message);

    // Assert
    expect(console_spy).toHaveBeenCalledOnce();
    const emitted = JSON.parse(console_spy.mock.calls[0][0] as string);
    expect(emitted.level).toBe("error");
    expect(emitted.message).toBe(test_message);
  });

  /** Verifica que logger.debug emita JSON con level="debug" */
  it("should_emit_debug_level_json", () => {
    // Arrange
    const test_message = "test debug message";

    // Act
    logger.debug(test_message);

    // Assert
    expect(console_spy).toHaveBeenCalledOnce();
    const emitted = JSON.parse(console_spy.mock.calls[0][0] as string);
    expect(emitted.level).toBe("debug");
    expect(emitted.message).toBe(test_message);
  });

  /** Verifica que el timestamp sea un ISO 8601 válido */
  it("should_include_valid_iso_timestamp", () => {
    // Arrange & Act
    logger.info("ts check");

    // Assert
    const emitted = JSON.parse(console_spy.mock.calls[0][0] as string);
    expect(typeof emitted.timestamp).toBe("string");
    expect(() => new Date(emitted.timestamp)).not.toThrow();
    expect(new Date(emitted.timestamp).toISOString()).toBe(emitted.timestamp);
  });

  /** Verifica que los metadatos opcionales se mezclen en el JSON emitido */
  it("should_spread_meta_object_into_output", () => {
    // Arrange
    const meta = { document_id: "doc-123", user_id: "user-456" };

    // Act
    logger.info("event with meta", meta);

    // Assert
    const emitted = JSON.parse(console_spy.mock.calls[0][0] as string);
    expect(emitted.document_id).toBe("doc-123");
    expect(emitted.user_id).toBe("user-456");
  });

  /** Verifica que la salida sea JSON válido (parseable) para todos los niveles */
  it.each([
    ["info" as const],
    ["warn" as const],
    ["error" as const],
    ["debug" as const],
  ])("should_always_emit_valid_json_for_level_%s", (level) => {
    // Arrange & Act
    logger[level](`${level} message`);

    // Assert
    expect(() =>
      JSON.parse(console_spy.mock.calls[0][0] as string)
    ).not.toThrow();
  });

  /** Verifica que sin metadatos no haya campos extra inesperados */
  it("should_emit_only_level_message_timestamp_without_meta", () => {
    // Arrange & Act
    logger.info("clean output");

    // Assert
    const emitted = JSON.parse(console_spy.mock.calls[0][0] as string);
    const keys = Object.keys(emitted);
    expect(keys).toEqual(expect.arrayContaining(["level", "message", "timestamp"]));
    expect(keys).toHaveLength(3);
  });
});
