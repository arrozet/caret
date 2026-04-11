import { describe, it, expect } from "vitest";
import {
  parsePagination,
  validateUuid,
  validateNonEmptyString,
  validateOptionalUuid,
  validateEmail,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from "../../src/lib/validation.js";
import { ValidationError } from "../../src/lib/errors.js";

/**
 * Unit tests for lib/validation.ts.
 * Cubre parsePagination, validateUuid, validateNonEmptyString,
 * y validateOptionalUuid — la capa de validación de entradas de todos los endpoints.
 */
describe("validation helpers", () => {
  /**
   * Tests para parse_pagination — parsea y valida parámetros de paginación
   * de query strings con defaults seguros.
   */
  describe("parsePagination", () => {
    /** verifica que retorna defaults cuando no hay parámetros */
    it("should_return_defaults_when_no_params_given", () => {
      // Arrange & Act
      const result = parsePagination(undefined, undefined);

      // Assert
      expect(result.limit).toBe(DEFAULT_PAGE_LIMIT);
      expect(result.offset).toBe(0);
    });

    /** verifica que parsea limit y offset válidos correctamente */
    it("should_parse_valid_limit_and_offset", () => {
      // Arrange & Act
      const result = parsePagination("20", "40");

      // Assert
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(40);
    });

    /** verifica que un limit de 0 lanza ValidationError */
    it("should_throw_ValidationError_for_limit_zero", () => {
      // Arrange & Act & Assert
      expect(() => parsePagination("0", undefined)).toThrow(ValidationError);
      expect(() => parsePagination("0", undefined)).toThrow("limit must be a positive integer");
    });

    /** verifica que un limit negativo lanza ValidationError */
    it("should_throw_ValidationError_for_negative_limit", () => {
      // Arrange & Act & Assert
      expect(() => parsePagination("-5", undefined)).toThrow(ValidationError);
    });

    /** verifica que un limit no numérico lanza ValidationError */
    it("should_throw_ValidationError_for_non_numeric_limit", () => {
      // Arrange & Act & Assert
      expect(() => parsePagination("abc", undefined)).toThrow(ValidationError);
    });

    /** verifica que un limit decimal lanza ValidationError (debe ser entero) */
    it("should_throw_ValidationError_for_float_limit", () => {
      // Arrange & Act & Assert
      expect(() => parsePagination("10.5", undefined)).toThrow(ValidationError);
    });

    /** verifica que el limit se recorta al MAX_PAGE_LIMIT */
    it("should_cap_limit_at_MAX_PAGE_LIMIT", () => {
      // Arrange
      const over_limit = String(MAX_PAGE_LIMIT + 50);

      // Act
      const result = parsePagination(over_limit, undefined);

      // Assert
      expect(result.limit).toBe(MAX_PAGE_LIMIT);
    });

    /** verifica que limit igual al máximo se acepta */
    it("should_accept_limit_equal_to_MAX_PAGE_LIMIT", () => {
      // Arrange & Act
      const result = parsePagination(String(MAX_PAGE_LIMIT), undefined);

      // Assert
      expect(result.limit).toBe(MAX_PAGE_LIMIT);
    });

    /** verifica que un offset negativo lanza ValidationError */
    it("should_throw_ValidationError_for_negative_offset", () => {
      // Arrange & Act & Assert
      expect(() => parsePagination(undefined, "-1")).toThrow(ValidationError);
      expect(() => parsePagination(undefined, "-1")).toThrow(
        "offset must be a non-negative integer",
      );
    });

    /** verifica que offset 0 es válido */
    it("should_accept_zero_offset", () => {
      // Arrange & Act
      const result = parsePagination(undefined, "0");

      // Assert
      expect(result.offset).toBe(0);
    });

    /** verifica que offset decimal lanza ValidationError */
    it("should_throw_ValidationError_for_float_offset", () => {
      // Arrange & Act & Assert
      expect(() => parsePagination(undefined, "5.5")).toThrow(ValidationError);
    });
  });

  /**
   * Tests para validate_uuid — valida formato UUID v4.
   */
  describe("validateUuid", () => {
    /** verifica que un UUID v4 válido no lanza error */
    it("should_not_throw_for_valid_uuid", () => {
      // Arrange
      const valid_uuid = "550e8400-e29b-41d4-a716-446655440000";

      // Act & Assert
      expect(() => validateUuid(valid_uuid, "id")).not.toThrow();
    });

    /** verifica que un UUID en mayúsculas también es válido */
    it("should_accept_uppercase_uuid", () => {
      // Arrange
      const upper_uuid = "550E8400-E29B-41D4-A716-446655440000";

      // Act & Assert
      expect(() => validateUuid(upper_uuid, "id")).not.toThrow();
    });

    /** verifica que una cadena vacía lanza ValidationError */
    it("should_throw_ValidationError_for_empty_string", () => {
      // Arrange & Act & Assert
      expect(() => validateUuid("", "id")).toThrow(ValidationError);
      expect(() => validateUuid("", "id")).toThrow("id must be a valid UUID");
    });

    /** verifica que una cadena arbitraria lanza ValidationError */
    it("should_throw_ValidationError_for_random_string", () => {
      // Arrange & Act & Assert
      expect(() => validateUuid("not-a-uuid", "workspace_id")).toThrow(ValidationError);
    });

    /** verifica que un UUID sin guiones lanza ValidationError */
    it("should_throw_ValidationError_for_uuid_without_dashes", () => {
      // Arrange
      const no_dashes = "550e8400e29b41d4a716446655440000";

      // Act & Assert
      expect(() => validateUuid(no_dashes, "id")).toThrow(ValidationError);
    });

    /** verifica que el campo_name aparece en el mensaje de error */
    it("should_include_field_name_in_error_message", () => {
      // Arrange & Act & Assert
      expect(() => validateUuid("bad", "folder_id")).toThrow("folder_id must be a valid UUID");
    });
  });

  /**
   * Tests para validate_non_empty_string — valida strings no vacíos.
   */
  describe("validateNonEmptyString", () => {
    /** verifica que una cadena válida no lanza error */
    it("should_not_throw_for_non_empty_string", () => {
      // Arrange & Act & Assert
      expect(() => validateNonEmptyString("Hello World", "title")).not.toThrow();
    });

    /** verifica que una cadena vacía lanza ValidationError */
    it("should_throw_ValidationError_for_empty_string", () => {
      // Arrange & Act & Assert
      expect(() => validateNonEmptyString("", "title")).toThrow(ValidationError);
    });

    /** verifica que una cadena solo con espacios lanza ValidationError */
    it("should_throw_ValidationError_for_whitespace_only_string", () => {
      // Arrange & Act & Assert
      expect(() => validateNonEmptyString("   ", "name")).toThrow(ValidationError);
    });

    /** verifica que un número lanza ValidationError */
    it("should_throw_ValidationError_for_number", () => {
      // Arrange & Act & Assert
      expect(() => validateNonEmptyString(42, "title")).toThrow(ValidationError);
    });

    /** verifica que null lanza ValidationError */
    it("should_throw_ValidationError_for_null", () => {
      // Arrange & Act & Assert
      expect(() => validateNonEmptyString(null, "title")).toThrow(ValidationError);
    });

    /** verifica que undefined lanza ValidationError */
    it("should_throw_ValidationError_for_undefined", () => {
      // Arrange & Act & Assert
      expect(() => validateNonEmptyString(undefined, "title")).toThrow(ValidationError);
    });

    /** verifica que el campo_name aparece en el mensaje */
    it("should_include_field_name_in_error_message", () => {
      // Arrange & Act & Assert
      expect(() => validateNonEmptyString("", "workspace_id")).toThrow("workspace_id is required");
    });
  });

  /**
   * Tests para validate_optional_uuid — acepta undefined/null pero valida si hay valor.
   */
  describe("validateOptionalUuid", () => {
    /** verifica que undefined no lanza error */
    it("should_not_throw_for_undefined", () => {
      // Arrange & Act & Assert
      expect(() => validateOptionalUuid(undefined, "folder_id")).not.toThrow();
    });

    /** verifica que null no lanza error */
    it("should_not_throw_for_null", () => {
      // Arrange & Act & Assert
      expect(() => validateOptionalUuid(null, "folder_id")).not.toThrow();
    });

    /** verifica que un UUID válido no lanza error */
    it("should_not_throw_for_valid_uuid", () => {
      // Arrange
      const valid_uuid = "550e8400-e29b-41d4-a716-446655440000";

      // Act & Assert
      expect(() => validateOptionalUuid(valid_uuid, "folder_id")).not.toThrow();
    });

    /** verifica que un string no-UUID lanza ValidationError */
    it("should_throw_ValidationError_for_invalid_uuid_string", () => {
      // Arrange & Act & Assert
      expect(() => validateOptionalUuid("not-a-uuid", "folder_id")).toThrow(ValidationError);
    });

    /** verifica que un número lanza ValidationError */
    it("should_throw_ValidationError_for_number", () => {
      // Arrange & Act & Assert
      expect(() => validateOptionalUuid(123, "folder_id")).toThrow(ValidationError);
    });

    /** verifica que el campo_name aparece en el mensaje */
    it("should_include_field_name_in_error_message", () => {
      // Arrange & Act & Assert
      expect(() => validateOptionalUuid("bad", "parent_folder_id")).toThrow(
        "parent_folder_id must be a valid UUID",
      );
    });
  });

  /**
   * Tests para validate_email — valida formato básico de correo electrónico.
   */
  describe("validateEmail", () => {
    /** verifica que un email válido no lanza error */
    it("should_not_throw_for_valid_email", () => {
      // Arrange & Act & Assert
      expect(() => validateEmail("juan@nombre.es", "email")).not.toThrow();
    });

    /** verifica que un email con espacios alrededor es válido tras trim del caller */
    it("should_not_throw_for_valid_email_with_uppercase", () => {
      // Arrange & Act & Assert
      expect(() => validateEmail("Juan.Perez@Nombre.Es", "email")).not.toThrow();
    });

    /** verifica que formato inválido lanza ValidationError */
    it("should_throw_ValidationError_for_invalid_email", () => {
      // Arrange & Act & Assert
      expect(() => validateEmail("not-an-email", "email")).toThrow(ValidationError);
      expect(() => validateEmail("not-an-email", "email")).toThrow("email must be a valid email");
    });

    /** verifica que null lanza ValidationError */
    it("should_throw_ValidationError_for_null", () => {
      // Arrange & Act & Assert
      expect(() => validateEmail(null, "email")).toThrow(ValidationError);
    });
  });
});
