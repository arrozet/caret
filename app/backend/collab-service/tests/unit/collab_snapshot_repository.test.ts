import { describe, it, expect, vi, beforeEach } from "vitest";
import { CollabSnapshotRepository } from "../../src/repositories/collab_snapshot_repository.js";
import type { CollabSnapshotInsert } from "../../src/models/index.js";

/**
 * Unit tests for CollabSnapshotRepository.
 *
 * These tests mock the Drizzle database client to verify repository logic
 * without requiring a real database connection.
 *
 * Tests cover:
 * - Snapshot creation with snapshot_seq validation
 * - Query methods (find_by_id, find_by_document_and_seq, get_latest_snapshot)
 * - List and count operations
 * - Delete operations for cleanup
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
const TEST_SNAPSHOT_ID = "770e8400-e29b-41d4-a716-446655440002";
const TEST_USER_ID = "660e8400-e29b-41d4-a716-446655440001";

function make_test_snapshot(
  snapshot_seq: number,
  overrides: Partial<CollabSnapshotInsert> = {},
): CollabSnapshotInsert {
  return {
    document_id: TEST_DOCUMENT_ID,
    snapshot_seq,
    ydoc: Buffer.from([10, 20, 30, snapshot_seq]),
    state_vector: Buffer.from([1, 2, 3]),
    created_by_user_id: TEST_USER_ID,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function make_stored_snapshot(snapshot_seq: number, overrides: Partial<any> = {}) {
  return {
    id: TEST_SNAPSHOT_ID,
    document_id: TEST_DOCUMENT_ID,
    snapshot_seq,
    ydoc: Buffer.from([10, 20, 30, snapshot_seq]),
    state_vector: Buffer.from([1, 2, 3]),
    created_by_user_id: TEST_USER_ID,
    created_at: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe("CollabSnapshotRepository", () => {
  let mock_db: ReturnType<typeof create_mock_db>;
  let repository: CollabSnapshotRepository;

  beforeEach(() => {
    mock_db = create_mock_db();
    repository = new CollabSnapshotRepository(mock_db);
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────
  // create() tests
  // ─────────────────────────────────────────────────────────────────

  describe("create", () => {
    it("should insert a snapshot and return it", async () => {
      // Arrange
      const input = make_test_snapshot(10);
      const expected = make_stored_snapshot(10);
      mock_db._insert_chain.returning.mockResolvedValue([expected]);

      // Act
      const result = await repository.create(input);

      // Assert
      expect(mock_db.insert).toHaveBeenCalledOnce();
      expect(mock_db._insert_chain.values).toHaveBeenCalledWith(input);
      expect(result).toEqual(expected);
    });

    it("should throw error when snapshot_seq is 0", async () => {
      // Arrange
      const input = make_test_snapshot(0);

      // Act & Assert
      await expect(repository.create(input)).rejects.toThrow(
        "Invalid snapshot_seq: 0. Must be > 0.",
      );
      expect(mock_db.insert).not.toHaveBeenCalled();
    });

    it("should throw error when snapshot_seq is negative", async () => {
      // Arrange
      const input = make_test_snapshot(-1);

      // Act & Assert
      await expect(repository.create(input)).rejects.toThrow(
        "Invalid snapshot_seq: -1. Must be > 0.",
      );
    });

    it("should allow snapshot_seq = 1 as minimum valid value", async () => {
      // Arrange
      const input = make_test_snapshot(1);
      const expected = make_stored_snapshot(1);
      mock_db._insert_chain.returning.mockResolvedValue([expected]);

      // Act
      const result = await repository.create(input);

      // Assert
      expect(result.snapshot_seq).toBe(1);
    });

    it("should propagate database errors", async () => {
      // Arrange
      const input = make_test_snapshot(5);
      mock_db._insert_chain.returning.mockRejectedValue(
        new Error("unique_violation: duplicate snapshot_seq"),
      );

      // Act & Assert
      await expect(repository.create(input)).rejects.toThrow("unique_violation");
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // find_by_id() tests
  // ─────────────────────────────────────────────────────────────────

  describe("find_by_id", () => {
    it("should return snapshot when found", async () => {
      // Arrange
      const expected = make_stored_snapshot(10);
      mock_db._select_chain.where.mockResolvedValue([expected]);

      // Act
      const result = await repository.find_by_id(TEST_SNAPSHOT_ID);

      // Assert
      expect(result).toEqual(expected);
    });

    it("should return null when not found", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([]);

      // Act
      const result = await repository.find_by_id("non-existent-id");

      // Assert
      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // find_by_document_and_seq() tests
  // ─────────────────────────────────────────────────────────────────

  describe("find_by_document_and_seq", () => {
    it("should return snapshot when found by document and seq", async () => {
      // Arrange
      const expected = make_stored_snapshot(15);
      mock_db._select_chain.where.mockResolvedValue([expected]);

      // Act
      const result = await repository.find_by_document_and_seq(TEST_DOCUMENT_ID, 15);

      // Assert
      expect(result).toEqual(expected);
    });

    it("should return null when no matching snapshot", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([]);

      // Act
      const result = await repository.find_by_document_and_seq(TEST_DOCUMENT_ID, 999);

      // Assert
      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // get_latest_snapshot() tests
  // ─────────────────────────────────────────────────────────────────

  describe("get_latest_snapshot", () => {
    it("should return snapshot with highest snapshot_seq", async () => {
      // Arrange
      const latest = make_stored_snapshot(100);
      mock_db._select_chain.limit.mockResolvedValue([latest]);

      // Act
      const result = await repository.get_latest_snapshot(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toEqual(latest);
      expect(mock_db._select_chain.orderBy).toHaveBeenCalled();
      expect(mock_db._select_chain.limit).toHaveBeenCalledWith(1);
    });

    it("should return null when document has no snapshots", async () => {
      // Arrange
      mock_db._select_chain.limit.mockResolvedValue([]);

      // Act
      const result = await repository.get_latest_snapshot(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // list_by_document() tests
  // ─────────────────────────────────────────────────────────────────

  describe("list_by_document", () => {
    it("should return all snapshots for document ordered by seq desc", async () => {
      // Arrange
      const snapshots = [
        make_stored_snapshot(30),
        make_stored_snapshot(20),
        make_stored_snapshot(10),
      ];
      mock_db._select_chain.orderBy.mockResolvedValue(snapshots);

      // Act
      const result = await repository.list_by_document(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toEqual(snapshots);
      expect(result[0].snapshot_seq).toBeGreaterThan(result[1].snapshot_seq);
    });

    it("should return empty array when document has no snapshots", async () => {
      // Arrange
      mock_db._select_chain.orderBy.mockResolvedValue([]);

      // Act
      const result = await repository.list_by_document(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // count_snapshots() tests
  // ─────────────────────────────────────────────────────────────────

  describe("count_snapshots", () => {
    it("should return count of snapshots for document", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([{ count: 5 }]);

      // Act
      const result = await repository.count_snapshots(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBe(5);
    });

    it("should return 0 when document has no snapshots", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([{ count: 0 }]);

      // Act
      const result = await repository.count_snapshots(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // delete_by_id() tests
  // ─────────────────────────────────────────────────────────────────

  describe("delete_by_id", () => {
    it("should delete snapshot and return it", async () => {
      // Arrange
      const deleted = make_stored_snapshot(10);
      mock_db._delete_chain.returning.mockResolvedValue([deleted]);

      // Act
      const result = await repository.delete_by_id(TEST_SNAPSHOT_ID);

      // Assert
      expect(mock_db.delete).toHaveBeenCalled();
      expect(result).toEqual(deleted);
    });

    it("should return null when snapshot not found", async () => {
      // Arrange
      mock_db._delete_chain.returning.mockResolvedValue([]);

      // Act
      const result = await repository.delete_by_id("non-existent-id");

      // Assert
      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // delete_old_snapshots() tests
  // ─────────────────────────────────────────────────────────────────

  describe("delete_old_snapshots", () => {
    it("should keep specified number of recent snapshots", async () => {
      // Arrange - keep 2, have 5 snapshots
      const snapshots_to_keep = [{ snapshot_seq: 50 }, { snapshot_seq: 40 }];
      mock_db._select_chain.limit.mockResolvedValue(snapshots_to_keep);
      mock_db._delete_chain.returning.mockResolvedValue([{ id: "s1" }, { id: "s2" }, { id: "s3" }]);

      // Act
      const result = await repository.delete_old_snapshots(TEST_DOCUMENT_ID, 2);

      // Assert
      expect(result).toBe(3);
    });

    it("should return 0 when fewer snapshots than keep_count", async () => {
      // Arrange - keep 5, have only 3 snapshots
      const snapshots_to_keep = [{ snapshot_seq: 30 }, { snapshot_seq: 20 }, { snapshot_seq: 10 }];
      mock_db._select_chain.limit.mockResolvedValue(snapshots_to_keep);

      // Act
      const result = await repository.delete_old_snapshots(TEST_DOCUMENT_ID, 5);

      // Assert
      expect(result).toBe(0);
      expect(mock_db.delete).not.toHaveBeenCalled();
    });

    it("should throw error when keep_count is less than 1", async () => {
      // Act & Assert
      await expect(repository.delete_old_snapshots(TEST_DOCUMENT_ID, 0)).rejects.toThrow(
        "keep_count must be at least 1",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // delete_all_snapshots() tests
  // ─────────────────────────────────────────────────────────────────

  describe("delete_all_snapshots", () => {
    it("should delete all snapshots for document", async () => {
      // Arrange
      const deleted = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
      mock_db._delete_chain.returning.mockResolvedValue(deleted);

      // Act
      const result = await repository.delete_all_snapshots(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBe(3);
    });

    it("should return 0 when document has no snapshots", async () => {
      // Arrange
      mock_db._delete_chain.returning.mockResolvedValue([]);

      // Act
      const result = await repository.delete_all_snapshots(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // has_snapshots() tests
  // ─────────────────────────────────────────────────────────────────

  describe("has_snapshots", () => {
    it("should return true when document has snapshots", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([{ count: 3 }]);

      // Act
      const result = await repository.has_snapshots(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBe(true);
    });

    it("should return false when document has no snapshots", async () => {
      // Arrange
      mock_db._select_chain.where.mockResolvedValue([{ count: 0 }]);

      // Act
      const result = await repository.has_snapshots(TEST_DOCUMENT_ID);

      // Assert
      expect(result).toBe(false);
    });
  });
});
