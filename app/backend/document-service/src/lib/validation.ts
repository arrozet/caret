import { ValidationError } from "./errors.js";

/** UUID v4 format regex (lowercase hex with dashes). */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID v4 format.
 * @param value - The string to validate.
 * @param field_name - Field name for the error message.
 * @throws ValidationError if the value is not a valid UUID.
 */
export function validate_uuid(value: string, field_name: string): void {
  if (!UUID_REGEX.test(value)) {
    throw new ValidationError(`${field_name} must be a valid UUID`);
  }
}

/**
 * Validate that a string is not empty after trimming.
 * @param value - The string to validate.
 * @param field_name - Field name for the error message.
 * @throws ValidationError if the value is empty.
 */
export function validate_non_empty_string(
  value: unknown,
  field_name: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${field_name} is required and must be a non-empty string`);
  }
}

/**
 * Validate that a value, if present, is a valid UUID.
 * @param value - The value to validate (may be undefined/null).
 * @param field_name - Field name for the error message.
 */
export function validate_optional_uuid(
  value: unknown,
  field_name: string,
): void {
  if (value !== undefined && value !== null) {
    if (typeof value !== "string" || !UUID_REGEX.test(value)) {
      throw new ValidationError(`${field_name} must be a valid UUID`);
    }
  }
}
