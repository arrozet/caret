import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../../src/lib/logger.js";

/**
 * Unit tests for lib/logger.ts.
 * Verifica que el logger emite JSON estructurado con nivel, mensaje,
 * timestamp y metadatos opcionales, usando console.log mockeado.
 */
describe("logger", () => {
  let console_log_spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    /* Intercepta console.log para capturar el output sin contaminar la consola */
    console_log_spy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Parsea el JSON emitido por el logger en la última llamada a console.log.
   */
  function get_last_log_entry(): Record<string, unknown> {
    const call_args = console_log_spy.mock.calls[0];
    return JSON.parse(call_args[0] as string) as Record<string, unknown>;
  }

  /** verifica que logger.info emite level "info" con el mensaje correcto */
  it("should_emit_info_level_log", () => {
    // Arrange & Act
    logger.info("Hello info");

    // Assert
    const entry = get_last_log_entry();
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("Hello info");
  });

  /** verifica que logger.warn emite level "warn" */
  it("should_emit_warn_level_log", () => {
    // Arrange & Act
    logger.warn("Something suspicious");

    // Assert
    const entry = get_last_log_entry();
    expect(entry.level).toBe("warn");
    expect(entry.message).toBe("Something suspicious");
  });

  /** verifica que logger.error emite level "error" */
  it("should_emit_error_level_log", () => {
    // Arrange & Act
    logger.error("Something broke");

    // Assert
    const entry = get_last_log_entry();
    expect(entry.level).toBe("error");
    expect(entry.message).toBe("Something broke");
  });

  /** verifica que logger.debug emite level "debug" */
  it("should_emit_debug_level_log", () => {
    // Arrange & Act
    logger.debug("Debug detail");

    // Assert
    const entry = get_last_log_entry();
    expect(entry.level).toBe("debug");
    expect(entry.message).toBe("Debug detail");
  });

  /** verifica que el output es JSON válido */
  it("should_emit_valid_json", () => {
    // Arrange & Act
    logger.info("Test JSON");

    // Assert
    const raw = console_log_spy.mock.calls[0][0] as string;
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  /** verifica que el output contiene un campo timestamp en formato ISO */
  it("should_include_iso_timestamp", () => {
    // Arrange & Act
    logger.info("Timestamped");

    // Assert
    const entry = get_last_log_entry();
    expect(typeof entry.timestamp).toBe("string");
    expect(() => new Date(entry.timestamp as string)).not.toThrow();
    /* ISO 8601 format check */
    expect(entry.timestamp as string).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  /** verifica que metadatos adicionales se incluyen en el output */
  it("should_include_meta_fields_in_output", () => {
    // Arrange & Act
    logger.info("With meta", { user_id: "user-123", action: "create" });

    // Assert
    const entry = get_last_log_entry();
    expect(entry.user_id).toBe("user-123");
    expect(entry.action).toBe("create");
  });

  /** verifica que no falla cuando meta es undefined */
  it("should_work_without_meta_argument", () => {
    // Arrange & Act & Assert
    expect(() => logger.info("No meta")).not.toThrow();
  });

  /** verifica que llama a console.log exactamente una vez por invocación */
  it("should_call_console_log_once_per_log_call", () => {
    // Arrange & Act
    logger.info("Single call");

    // Assert
    expect(console_log_spy).toHaveBeenCalledTimes(1);
  });
});
