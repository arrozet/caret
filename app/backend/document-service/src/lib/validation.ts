import { ValidationError } from "./errors.js";

/** UUID v4 format regex (lowercase hex with dashes). */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Basic email format regex for invite endpoints. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Default number of items per page. */
export const DEFAULT_PAGE_LIMIT = 50;
/** Maximum allowed items per page. */
export const MAX_PAGE_LIMIT = 100;

/** Parsed and validated pagination parameters. */
export interface PaginationParams {
  limit: number;
  offset: number;
}

/** Paginated response envelope returned by list endpoints. */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

/**
 * Parse and validate pagination query parameters.
 * @param raw_limit - Raw limit string from query params.
 * @param raw_offset - Raw offset string from query params.
 * @returns Validated pagination parameters with safe defaults.
 */
export function parsePagination(rawLimit?: string, rawOffset?: string): PaginationParams {
  let limit = DEFAULT_PAGE_LIMIT;
  let offset = 0;

  if (rawLimit !== undefined) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new ValidationError("limit must be a positive integer");
    }
    if (limit > MAX_PAGE_LIMIT) {
      limit = MAX_PAGE_LIMIT;
    }
  }

  if (rawOffset !== undefined) {
    offset = Number(rawOffset);
    if (!Number.isInteger(offset) || offset < 0) {
      throw new ValidationError("offset must be a non-negative integer");
    }
  }

  return { limit, offset };
}

export const parse_pagination = parsePagination;

/**
 * Validate that a string is a valid UUID v4 format.
 * @param value - The string to validate.
 * @param field_name - Field name for the error message.
 * @throws ValidationError if the value is not a valid UUID.
 */
export function validateUuid(value: string, fieldName: string): void {
  if (!UUID_REGEX.test(value)) {
    throw new ValidationError(`${fieldName} must be a valid UUID`);
  }
}

export const validate_uuid = validateUuid;

/**
 * Validate that a string is not empty after trimming.
 * @param value - The string to validate.
 * @param field_name - Field name for the error message.
 * @throws ValidationError if the value is empty.
 */
export function validateNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} is required and must be a non-empty string`);
  }
}

export const validate_non_empty_string = validateNonEmptyString;

/**
 * Validate that a value, if present, is a valid UUID.
 * @param value - The value to validate (may be undefined/null).
 * @param field_name - Field name for the error message.
 */
export function validateOptionalUuid(value: unknown, fieldName: string): void {
  if (value !== undefined && value !== null) {
    if (typeof value !== "string" || !UUID_REGEX.test(value)) {
      throw new ValidationError(`${fieldName} must be a valid UUID`);
    }
  }
}

export const validate_optional_uuid = validateOptionalUuid;

/**
 * Validate that a value is a syntactically valid email address.
 * @param value - The value to validate.
 * @param field_name - Field name for the error message.
 * @throws ValidationError if the value is not a valid email string.
 */
export function validateEmail(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || !EMAIL_REGEX.test(value.trim())) {
    throw new ValidationError(`${fieldName} must be a valid email`);
  }
}

export const validate_email = validateEmail;
