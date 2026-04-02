import { describe, it, expect, vi, beforeEach } from "vitest";
import { CollabUpdateRepository } from "../../src/repositories/collab_update_repository.js";
import type { CollabUpdateInsert } from "../../src/models/index.js";

/**
 * Unit tests for CollabUpdateRepository.
 *
 * These tests mock the Drizzle database client to verify repository logic
 * without requiring a real database connection.
 *
 * Tests cover:
 * - Single update creation with seq validation
 * - Batch insert operations
 * - Query methods (find_by_key, get_updates_after_seq, get_all_updates)
 * - Aggregation methods (get_max_seq, count_updates)
 * - Delete operations for compaction
 */

// ─────────────────────────────────────────────────────────────────
// Mock database setup
// ─────────────────────────────────────────────────────────────────

/**
 * Creates a mock Drizzle database client.
 * Returns chainable query builder mocks.
 */
function create_mock_db() {
  // Chainable mock for SELECT queries
  const select_chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };

  // Chainable mock for INSERT queries
  const insert_chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };

  // Chainable mock for DELETE queries
  const delete_chain = {
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };

  const mock_db = {
    select: vi.fn().mockReturnValue(select_chain),
    insert: vi.fn().mockReturnValue(insert_chain),
    delete: vi.fn().mockReturnValue(delete_chain),
    _select_chain: select_chain,
    _insert_chain: insert_chain,
    _delete_chain: delete_chain,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return mock_db as any;
}

// ─────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────

const TEST_DOCUMENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_USER_ID = "660e8400-e29b-41d4-a716-446655440001";

function make_test_update(
  seq: number,
  overrides: Partial<CollabUpdateInsert> = {},
): CollabUpdateInsert {
  return {
    document_id: TEST_DOCUMENT_ID,
    seq,
    update: Buffer.from([1, 2, 3, seq]),
    client_id: 12345,
    user_id: TEST_USER_ID,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function make_stored_update(seq: number, overrides: Partial<any> = {}) {
  return {
    document_id: TEST_DOCUMENT_ID,
    seq,
    update: Buffer.from([1, 2, 3, seq]),
    client_id: 12345,
    user_id: TEST_USER_ID,
    created_at: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe("CollabUpdateRepository", () => {
  let mock_db: ReturnType<typeof create_mock_db>;
  let repository: CollabUpdateRepository;

  beforeEach(() => {
    mock_db = create_mock_db();
    repository = new CollabUpdateRepository(mock_db);
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────
  // create() tests
  // ─────────────────────────────────────────────────────────────────

  describe("create", () => {
    it("should insert a single update and return it", async () => {
      // Arrange
      const input = make_test_update(1);
      const expected = make_stored_update(1);
      mock_db._insert_chain.returning.mockResolvedValue([expected]);

      // Act
      const result = await repository.create(input);

      // Assert
      expect(mock_db.insert).toHaveBeenCalledOnce();
      expect(mock_db._insert_chain.values).toHaveBeenCalledWith(input);
      expect(result).toEqual(expected);
    });

    it("should throw error when seq is 0", async () => {
      // Arrange
      const input = make_test_update(0);

      // Act & Assert
      await expect(repository.create(input)).rejects.toThrow(
        "Invalid sequence number: 0. Must be > 0.",
      );
      expect(mock_db.insert).not.toHaveBeenCalled();
    });

    it("should throw error when seq is negative", async () => {
      // Arrange
      const input = make_test_update(-5);

      // Act & Assert
      await expect(repository.create(input)).rejects.toThrow(
        "Invalid sequence number: -5. Must be > 0.",
      );
    });

    it("should allow seq = 1 as minimum valid value", async () => {
      // Arrange
      const input = make_test_update(1);
      const expected = make_stored_update(1);
      mock_db._insert_chain.returning.mockResolvedValue([expected]);

      // Act
      const result = await repository.create(input);

      // Assert
      expect(result.seq).toBe(1);
    });

    it("should propagate database errors", async () => {
      // Arrange
      const input = make_test_update(1);
      mock_db._insert_chain.returning.mockRejectedValue(
        new Error("unique_violation: duplicate key"),
      );

      // Act & Assert
      await expect(repository.create(input)).rejects.toThrow("unique_violation");
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // create_batch() tests
  // ─────────────────────────────────────────────────────────────────

  describe("create_batch", () => {
    it("should insert multiple updates in one call", async () => {
      // Arrange
      const inputs = [make_test_update(1), make_test_update(2), make_test_update(3)];
      const stored = [make_stored_update(1), make_stored_update(2), make_stored_update(3)];
      mock_db._insert_chain.returning.mockResolvedValue(stored);

      // Act
      const result = await repository.create_batch(inputs);

      // Assert
      expect(mock_db._insert_chain.values).toHaveBeenCalledWith(inputs);
      expect(result.inserted_count).toBe(3);
      expect(result.last_seq).toBe(3);
    });

    it("should throw error for empty batch", async () => {
      // Act & Assert
      await expect(repository.create_batch([])).rejects.toThrow(
        "Cannot insert empty batch of updates",
      );
      expect(mock_db.insert).not.toHaveBeenCalled();
    });

    it("should throw error if any seq is invalid", async () => {
      // Arrange
      const inputs = [make_test_update(1), make_test_update(0), make_test_update(3)];

      // Act & Assert
      await expect(repository.create_batch(inputs)).rejects.toThrow(
        "Invalid sequence number: 0. Must be > 0.",
      );
    });

    it("should return correct last_seq for non-sequential inserts", async () => {
      // Arrange
      const inputs = [make_test_update(5), make_test_update(10), make_test_update(7)];
      const stored = [make_stored_update(5), make_stored_update(10), make_stored_update(7)];
      mock_db._insert_chain.returning.mockResolvedValue(stored);

      // Act
      const result = await repository.create_batch(inputs);

      // Assert
      expect(result.last_seq).toBe(10);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // find_by_key() tests
  // ─────────────────────────────────────────────────────────────────

  describe("find_by_key", () => {
    it("should return update when found", async () => {
      // Arrange
      const expected = make_stored_update(5);
      // Make the select chain resolve to an array
      mock_db._select_chain.where.mockResolvedValue([expected]);

      // Act
      const result = await repository.find_by_key({
        document_id: TEST_DOCUMENT_ID,
        seq: 5,
      });

      // Assert
      expect(result).toEqual(expected);
    });

    it("should return null when not found", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([]);

      // Act
      const result = await repository.find_by_key({
        document_id: TEST_DOCUMENT_ID,
        seq: 999,
      });

      // Assert
      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // get_updates_after_seq() tests
  // ─────────────────────────────────────────────────────────────────

  describe("get_updates_after_seq", () => {
    it("should return updates after specified seq ordered by seq asc", async () => {
      // Arrange
      const updates = [make_stored_update(6), make_stored_update(7), make_stored_update(8)];
      mock_db._select_chain.orderBy.mockResolvedValue(updates);

      // Act
      const result = await repository.get_updates_after_seq({
        document_id: TEST_DOCUMENT_ID,
        after_seq: 5,
      });

      // Assert
      expect(result).toEqual(updates);
      expect(mock_db.select).toHaveBeenCalled();
    });

    it("should apply limit when specified", async () => {
      // Arrange
      const updates = [make_stored_update(6), make_stored_update(7)];
      mock_db._select_chain.limit.mockResolvedValue(updates);

      // Act
      const result = await repository.get_updates_after_seq({
        document_id: TEST_DOCUMENT_ID,
        after_seq: 5,
        limit: 2,
      });

      // Assert
      expect(mock_db._select_chain.limit).toHaveBeenCalledWith(2);
      expect(result).toEqual(updates);
    });

    it("should return empty array when no updates after seq", async () => {
      // Arrange
      mock_db._select_chain.orderBy.mockResolvedValue([]);

      // Act
      const result = await repository.get_updates_after_seq({
        document_id: TEST_DOCUMENT_ID,
        after_seq: 1000,
      });

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // get_all_updates() tests
  // ─────────────────────────────────────────────────────────────────

  describe("get_all_updates", () => {
    it("should return all updates for document ordered by seq", async () => {
      // Arrange
      const updates = [make_stored_update(1), make_stored_update(2), make_stored_update(3)];
      mock_db._select_chain.orderBy.mockResolvedValue(updates);

      // Act
      const result = await repository.get_all_updates(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toEqual(updates);
    });

    it("should return empty array for document with no updates", async () => {
      // Arrange
      mock_db._select_chain.orderBy.mockResolvedValue([]);

      // Act
      const result = await repository.get_all_updates(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // get_max_seq() tests
  // ─────────────────────────────────────────────────────────────────

  describe("get_max_seq", () => {
    it("should return highest seq for document", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([{ max_seq: 42 }]);

      // Act
      const result = await repository.get_max_seq(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBe(42);
    });

    it("should return 0 when document has no updates", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([{ max_seq: 0 }]);

      // Act
      const result = await repository.get_max_seq(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBe(0);
    });

    it("should return 0 when query returns null/undefined", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([]);

      // Act
      const result = await repository.get_max_seq(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // count_updates() tests
  // ─────────────────────────────────────────────────────────────────

  describe("count_updates", () => {
    it("should return total count of updates", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([{ count: 15 }]);

      // Act
      const result = await repository.count_updates(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBe(15);
    });

    it("should return 0 for document with no updates", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([{ count: 0 }]);

      // Act
      const result = await repository.count_updates(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // count_updates_after_seq() tests
  // ─────────────────────────────────────────────────────────────────

  describe("count_updates_after_seq", () => {
    it("should return count of updates after specified seq", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([{ count: 7 }]);

      // Act
      const result = await repository.count_updates_after_seq(TEST_DOCUMENT_ID, 10);

      // Assert
      expect(result).toBe(7);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // delete_updates_up_to_seq() tests
  // ─────────────────────────────────────────────────────────────────

  describe("delete_updates_up_to_seq", () => {
    it("should delete updates and return count", async () => {
      // Arrange
      const deleted = [{ seq: 1 }, { seq: 2 }, { seq: 3 }];
      mock_db._delete_chain.returning.mockResolvedValue(deleted);

      // Act
      const result = await repository.delete_updates_up_to_seq(TEST_DOCUMENT_ID, 3);

      // Assert
      expect(mock_db.delete).toHaveBeenCalled();
      expect(result).toBe(3);
    });

    it("should return 0 when no updates to delete", async () => {
      // Arrange
      mock_db._delete_chain.returning.mockResolvedValue([]);

      // Act
      const result = await repository.delete_updates_up_to_seq(TEST_DOCUMENT_ID, 0);

      // Assert
      expect(result).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // delete_all_updates() tests
  // ─────────────────────────────────────────────────────────────────

  describe("delete_all_updates", () => {
    it("should delete all updates for document", async () => {
      // Arrange
      const deleted = [{ seq: 1 }, { seq: 2 }, { seq: 3 }, { seq: 4 }];
      mock_db._delete_chain.returning.mockResolvedValue(deleted);

      // Act
      const result = await repository.delete_all_updates(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBe(4);
    });
  });
});
