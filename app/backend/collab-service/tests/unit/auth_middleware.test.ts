import { describe, it, expect } from "vitest";
import type { IncomingMessage } from "http";
import { SignJWT } from "jose";
import { UnauthorizedError } from "../../src/lib/errors.js";

/**
 * Unit tests for the WebSocket JWT authentication middleware.
 * Verifies validate_ws_token extracts and validates tokens correctly,
 * rejects invalid/expired tokens, and extracts doc_id from URL path.
 */

// Test secret - set via environment variable before importing the middleware
const TEST_JWT_SECRET = "test-jwt-secret-for-unit-tests-minimum-32-chars";
const TEST_USER_ID = "user-123-abc";
const TEST_DOC_ID = "doc-456-xyz";

// Set env var before importing the module that uses it
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;

// Now import the middleware (after setting env var)
const { validate_ws_token } = await import("../../src/middleware/auth_middleware.js");

/**
 * Creates a signed JWT for testing purposes.
 */
async function create_test_jwt(options: {
  sub?: string;
  exp_offset_seconds?: number;
  secret?: string;
}): Promise<string> {
  const { sub = TEST_USER_ID, exp_offset_seconds = 3600, secret = TEST_JWT_SECRET } = options;

  const secret_key = new TextEncoder().encode(secret);
  const jwt = new SignJWT({ sub }).setProtectedHeader({ alg: "HS256" }).setIssuedAt();

  if (exp_offset_seconds !== null) {
    jwt.setExpirationTime(Math.floor(Date.now() / 1000) + exp_offset_seconds);
  }

  return await jwt.sign(secret_key);
}

/**
 * Creates an expired JWT for testing expiration handling.
 */
async function create_expired_jwt(): Promise<string> {
  return create_test_jwt({ exp_offset_seconds: -3600 }); // Expired 1 hour ago
}

describe("validate_ws_token", () => {
  /**
   * Constructs a mock IncomingMessage with the given URL and host.
   */
  function make_mock_request(url: string, host = "localhost:3003"): IncomingMessage {
    return {
      url,
      headers: { host },
    } as unknown as IncomingMessage;
  }

  // ==================== Token Extraction Tests ====================

  describe("token extraction", () => {
    /** Verifies UnauthorizedError when token query param is missing */
    it("should_throw_unauthorized_error_when_token_missing", async () => {
      const req = make_mock_request(`/document/${TEST_DOC_ID}`);
      await expect(validate_ws_token(req)).rejects.toThrow(UnauthorizedError);
    });

    /** Verifies error message when token is missing */
    it("should_throw_with_missing_token_message", async () => {
      const req = make_mock_request(`/document/${TEST_DOC_ID}`);
      await expect(validate_ws_token(req)).rejects.toThrow("Missing token query parameter");
    });

    /** Verifies UnauthorizedError has status 401 */
    it("should_throw_unauthorized_error_with_status_401", async () => {
      const req = make_mock_request(`/document/${TEST_DOC_ID}`);
      let caught_error: unknown;
      try {
        await validate_ws_token(req);
      } catch (e) {
        caught_error = e;
      }
      expect(caught_error).toBeInstanceOf(UnauthorizedError);
      expect((caught_error as UnauthorizedError).status_code).toBe(401);
    });

    /** Verifies handling of URL without query string */
    it("should_throw_when_url_has_no_query_string", async () => {
      const req = make_mock_request(`/document/${TEST_DOC_ID}`);
      await expect(validate_ws_token(req)).rejects.toThrow(UnauthorizedError);
    });

    /** Verifies handling of undefined URL */
    it("should_throw_when_url_is_undefined", async () => {
      const req = {
        url: undefined,
        headers: { host: "localhost:3003" },
      } as unknown as IncomingMessage;
      await expect(validate_ws_token(req)).rejects.toThrow(UnauthorizedError);
    });

    /** Verifies empty token is treated as missing */
    it("should_throw_when_token_param_is_empty_string", async () => {
      const req = make_mock_request(`/document/${TEST_DOC_ID}?token=`);
      await expect(validate_ws_token(req)).rejects.toThrow(UnauthorizedError);
    });
  });

  // ==================== JWT Validation Tests ====================

  describe("JWT validation", () => {
    /** Verifies successful validation returns AuthResult with user_id, doc_id, token */
    it("should_return_auth_result_with_valid_jwt", async () => {
      const token = await create_test_jwt({});
      const req = make_mock_request(`/document/${TEST_DOC_ID}?token=${token}`);

      const result = await validate_ws_token(req);

      expect(result).toMatchObject({
        user_id: TEST_USER_ID,
        doc_id: TEST_DOC_ID,
        token: token,
      });
    });

    /** Verifies token expiration is enforced */
    it("should_throw_when_token_is_expired", async () => {
      const token = await create_expired_jwt();
      const req = make_mock_request(`/document/${TEST_DOC_ID}?token=${token}`);

      await expect(validate_ws_token(req)).rejects.toThrow("Token has expired");
    });

    /** Verifies invalid signature is rejected */
    it("should_throw_when_token_signature_is_invalid", async () => {
      const token = await create_test_jwt({ secret: "wrong-secret-that-is-also-32-chars" });
      const req = make_mock_request(`/document/${TEST_DOC_ID}?token=${token}`);

      await expect(validate_ws_token(req)).rejects.toThrow("Invalid token signature");
    });

    /** Verifies malformed tokens are rejected */
    it("should_throw_when_token_is_malformed", async () => {
      const req = make_mock_request(`/document/${TEST_DOC_ID}?token=not-a-valid-jwt`);

      await expect(validate_ws_token(req)).rejects.toThrow(UnauthorizedError);
    });

    /** Verifies tokens without sub claim are rejected */
    it("should_throw_when_token_missing_sub_claim", async () => {
      // Create a token without sub claim by using raw SignJWT
      const secret_key = new TextEncoder().encode(TEST_JWT_SECRET);
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(secret_key);

      const req = make_mock_request(`/document/${TEST_DOC_ID}?token=${token}`);

      await expect(validate_ws_token(req)).rejects.toThrow("Invalid token: missing sub claim");
    });

    /** Verifies URL-encoded tokens are handled correctly */
    it("should_handle_url_encoded_token", async () => {
      const token = await create_test_jwt({});
      const req = make_mock_request(`/document/${TEST_DOC_ID}?token=${encodeURIComponent(token)}`);

      const result = await validate_ws_token(req);

      expect(result.user_id).toBe(TEST_USER_ID);
      expect(result.token).toBe(token);
    });

    /** Verifies token extraction with multiple query params */
    it("should_extract_token_when_multiple_query_params_present", async () => {
      const token = await create_test_jwt({});
      const req = make_mock_request(`/document/${TEST_DOC_ID}?version=2&token=${token}&foo=bar`);

      const result = await validate_ws_token(req);

      expect(result.user_id).toBe(TEST_USER_ID);
      expect(result.doc_id).toBe(TEST_DOC_ID);
    });
  });

  // ==================== Doc ID Extraction Tests ====================

  describe("doc_id extraction", () => {
    /** Verifies doc_id is correctly extracted from path */
    it("should_extract_doc_id_from_path", async () => {
      const token = await create_test_jwt({});
      const req = make_mock_request(`/document/my-document-id?token=${token}`);

      const result = await validate_ws_token(req);

      expect(result.doc_id).toBe("my-document-id");
    });

    /** Verifies UUIDs are handled correctly */
    it("should_handle_uuid_doc_id", async () => {
      const uuid_doc_id = "550e8400-e29b-41d4-a716-446655440000";
      const token = await create_test_jwt({});
      const req = make_mock_request(`/document/${uuid_doc_id}?token=${token}`);

      const result = await validate_ws_token(req);

      expect(result.doc_id).toBe(uuid_doc_id);
    });

    /** Verifies error when document path is invalid */
    it("should_throw_when_document_path_invalid", async () => {
      const token = await create_test_jwt({});
      const req = make_mock_request(`/invalid-path?token=${token}`);

      await expect(validate_ws_token(req)).rejects.toThrow("Invalid document path");
    });

    /** Verifies error when doc_id is missing from path */
    it("should_throw_when_doc_id_missing_from_path", async () => {
      const token = await create_test_jwt({});
      const req = make_mock_request(`/document/?token=${token}`);

      await expect(validate_ws_token(req)).rejects.toThrow("Invalid document path");
    });

    /** Verifies doc_id with special characters (URL-safe) */
    it("should_handle_doc_id_with_underscores_and_hyphens", async () => {
      const doc_id = "doc_123-test_abc";
      const token = await create_test_jwt({});
      const req = make_mock_request(`/document/${doc_id}?token=${token}`);

      const result = await validate_ws_token(req);

      expect(result.doc_id).toBe(doc_id);
    });
  });

  // ==================== AuthResult Structure Tests ====================

  describe("AuthResult structure", () => {
    /** Verifies complete AuthResult structure */
    it("should_return_complete_auth_result", async () => {
      const token = await create_test_jwt({});
      const req = make_mock_request(`/document/${TEST_DOC_ID}?token=${token}`);

      const result = await validate_ws_token(req);

      expect(result).toHaveProperty("user_id");
      expect(result).toHaveProperty("doc_id");
      expect(result).toHaveProperty("token");
      expect(typeof result.user_id).toBe("string");
      expect(typeof result.doc_id).toBe("string");
      expect(typeof result.token).toBe("string");
    });

    /** Verifies token in result matches input token */
    it("should_include_original_token_in_result", async () => {
      const token = await create_test_jwt({});
      const req = make_mock_request(`/document/${TEST_DOC_ID}?token=${token}`);

      const result = await validate_ws_token(req);

      expect(result.token).toBe(token);
    });
  });
});
