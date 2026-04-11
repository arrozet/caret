import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import * as Y from "yjs";
import type { CollabUpdate, CollabSnapshot } from "../../src/models/index.js";
import type { ICollabRepository } from "../../src/repositories/index.js";
import { CollabPersistenceService } from "../../src/services/index.js";

/**
 * Unit tests para la capa de persistencia del collab-service.
 * Verifica el guardado y carga de estado Y.js (updates y snapshots)
 * mockeando la DB/repositorio para aislar la lógica de persistencia.
 */

// ─────────────────────────────────────────────────────────────────
// Mock del repositorio con typed mocks
// ─────────────────────────────────────────────────────────────────

interface MockCollabRepository extends ICollabRepository {
  save_update: Mock<ICollabRepository["save_update"]>;
  get_updates: Mock<ICollabRepository["get_updates"]>;
  save_snapshot: Mock<ICollabRepository["save_snapshot"]>;
  get_latest_snapshot: Mock<ICollabRepository["get_latest_snapshot"]>;
  delete_updates_before: Mock<ICollabRepository["delete_updates_before"]>;
}

function make_mock_repository(): MockCollabRepository {
  return {
    save_update: vi.fn(),
    get_updates: vi.fn(),
    save_snapshot: vi.fn(),
    get_latest_snapshot: vi.fn(),
    delete_updates_before: vi.fn(),
  };
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe("CollabPersistenceService", () => {
  let mock_repo: MockCollabRepository;
  let service: CollabPersistenceService;

  beforeEach(() => {
    mock_repo = make_mock_repository();
    service = new CollabPersistenceService(mock_repo);
    vi.clearAllMocks();
  });

  /**
   * Tests de persist_update — guardado de updates incrementales.
   */
  describe("persist_update", () => {
    /** Verifica que persist_update llame a repository.save_update con los parámetros correctos */
    it("should_call_save_update_with_document_id_and_data", async () => {
      // Arrange
      const document_id = "doc-123";
      const doc = new Y.Doc();
      doc.getText("content").insert(0, "hello");
      const update = Y.encodeStateAsUpdate(doc);
      const expected_result: CollabUpdate = {
        id: "update-1",
        document_id,
        update,
        created_at: new Date(),
      };
      mock_repo.save_update.mockResolvedValue(expected_result);

      // Act
      const result = await service.persistUpdate(document_id, update);

      // Assert
      expect(mock_repo.save_update).toHaveBeenCalledOnce();
      expect(mock_repo.save_update).toHaveBeenCalledWith(document_id, update);
      expect(result.id).toBe("update-1");
    });

    /** Verifica que persist_update retorne el resultado del repositorio */
    it("should_return_saved_update_from_repository", async () => {
      // Arrange
      const document_id = "doc-456";
      const update = new Uint8Array([1, 2, 3, 4]);
      const saved: CollabUpdate = {
        id: "upd-xyz",
        document_id,
        update,
        created_at: new Date(),
      };
      mock_repo.save_update.mockResolvedValue(saved);

      // Act
      const result = await service.persistUpdate(document_id, update);

      // Assert
      expect(result).toEqual(saved);
    });

    /** Verifica que los errores del repositorio se propaguen sin silenciarlos */
    it("should_propagate_repository_errors", async () => {
      // Arrange
      const document_id = "doc-error";
      const update = new Uint8Array([1]);
      mock_repo.save_update.mockRejectedValue(new Error("DB write failed"));

      // Act & Assert
      await expect(service.persistUpdate(document_id, update)).rejects.toThrow("DB write failed");
    });
  });

  /**
   * Tests de load_document — reconstrucción del estado desde DB.
   */
  describe("load_document", () => {
    /** Verifica que load_document devuelva un YDoc cuando no hay datos */
    it("should_return_empty_ydoc_when_no_snapshot_or_updates", async () => {
      // Arrange
      const document_id = "empty-doc";
      mock_repo.get_latest_snapshot.mockResolvedValue(null);
      mock_repo.get_updates.mockResolvedValue([]);

      // Act
      const doc = await service.loadDocument(document_id);

      // Assert
      expect(doc).toBeInstanceOf(Y.Doc);
      expect(doc.getText("content").toString()).toBe("");
    });

    /** Verifica que load_document aplique el snapshot base si existe */
    it("should_apply_snapshot_when_available", async () => {
      // Arrange
      const document_id = "snapshot-doc";
      const source_doc = new Y.Doc();
      source_doc.getText("content").insert(0, "from snapshot");
      const snapshot_data = Y.encodeStateAsUpdate(source_doc);

      mock_repo.get_latest_snapshot.mockResolvedValue({
        id: "snap-1",
        document_id,
        snapshot_data,
        state_vector: Y.encodeStateVector(source_doc),
        created_at: new Date(),
      });
      mock_repo.get_updates.mockResolvedValue([]);

      // Act
      const doc = await service.loadDocument(document_id);

      // Assert
      expect(doc.getText("content").toString()).toBe("from snapshot");
    });

    /** Verifica que load_document aplique updates sobre el snapshot */
    it("should_apply_updates_on_top_of_snapshot", async () => {
      // Arrange
      const document_id = "update-over-snap";

      // Estado base (snapshot)
      const base_doc = new Y.Doc();
      base_doc.getText("content").insert(0, "base");
      const snapshot_data = Y.encodeStateAsUpdate(base_doc);

      // Update incremental
      const delta_doc = new Y.Doc();
      Y.applyUpdate(delta_doc, snapshot_data);
      delta_doc.getText("content").insert(4, " + delta");
      const sv_after_snap = Y.encodeStateVector(base_doc);
      const delta_update = Y.encodeStateAsUpdate(delta_doc, sv_after_snap);

      mock_repo.get_latest_snapshot.mockResolvedValue({
        id: "snap-base",
        document_id,
        snapshot_data,
        state_vector: Y.encodeStateVector(base_doc),
        created_at: new Date(),
      });
      mock_repo.get_updates.mockResolvedValue([
        {
          id: "upd-1",
          document_id,
          update: delta_update,
          created_at: new Date(),
        },
      ]);

      // Act
      const doc = await service.loadDocument(document_id);

      // Assert
      expect(doc.getText("content").toString()).toBe("base + delta");
    });

    /** Verifica que múltiples updates sean aplicados en orden */
    it("should_apply_multiple_updates_in_order", async () => {
      // Arrange
      const document_id = "multi-update-doc";
      mock_repo.get_latest_snapshot.mockResolvedValue(null);

      // Crear tres updates secuenciales
      const doc_source = new Y.Doc();
      doc_source.getText("content").insert(0, "A");
      const update_1 = Y.encodeStateAsUpdate(doc_source);

      const sv_after_1 = Y.encodeStateVector(doc_source);
      doc_source.getText("content").insert(1, "B");
      const update_2 = Y.encodeStateAsUpdate(doc_source, sv_after_1);

      const sv_after_2 = Y.encodeStateVector(doc_source);
      doc_source.getText("content").insert(2, "C");
      const update_3 = Y.encodeStateAsUpdate(doc_source, sv_after_2);

      mock_repo.get_updates.mockResolvedValue([
        { id: "u1", document_id, update: update_1, created_at: new Date() },
        { id: "u2", document_id, update: update_2, created_at: new Date() },
        { id: "u3", document_id, update: update_3, created_at: new Date() },
      ]);

      // Act
      const doc = await service.loadDocument(document_id);

      // Assert
      expect(doc.getText("content").toString()).toBe("ABC");
    });

    /** Verifica que load_document llame a get_latest_snapshot y get_updates */
    it("should_query_both_snapshot_and_updates_from_repository", async () => {
      // Arrange
      const document_id = "query-doc";
      mock_repo.get_latest_snapshot.mockResolvedValue(null);
      mock_repo.get_updates.mockResolvedValue([]);

      // Act
      await service.loadDocument(document_id);

      // Assert
      expect(mock_repo.get_latest_snapshot).toHaveBeenCalledWith(document_id);
      expect(mock_repo.get_updates).toHaveBeenCalledWith(document_id);
    });
  });

  /**
   * Tests de take_snapshot — creación de snapshots periódicos.
   */
  describe("take_snapshot", () => {
    /** Verifica que take_snapshot llame a save_snapshot con datos correctos */
    it("should_call_save_snapshot_with_encoded_state", async () => {
      // Arrange
      const document_id = "snap-target";
      const doc = new Y.Doc();
      doc.getText("content").insert(0, "snapshot me");

      const expected_snap: CollabSnapshot = {
        id: "snap-new",
        document_id,
        snapshot_data: Y.encodeStateAsUpdate(doc),
        state_vector: Y.encodeStateVector(doc),
        created_at: new Date(),
      };
      mock_repo.save_snapshot.mockResolvedValue(expected_snap);

      // Act
      const result = await service.takeSnapshot(document_id, doc);

      // Assert
      expect(mock_repo.save_snapshot).toHaveBeenCalledOnce();
      const [called_id, called_snap, called_sv] = mock_repo.save_snapshot.mock.calls[0];
      expect(called_id).toBe(document_id);
      expect(called_snap).toBeInstanceOf(Uint8Array);
      expect(called_sv).toBeInstanceOf(Uint8Array);
      expect(result.id).toBe("snap-new");
    });

    /** Verifica que el snapshot_data sea aplicable para restaurar el doc */
    it("should_produce_snapshot_data_that_restores_document", async () => {
      // Arrange
      const document_id = "restorable-doc";
      const doc = new Y.Doc();
      doc.getText("content").insert(0, "restore me");

      let captured_snapshot_data: Uint8Array | undefined;
      mock_repo.save_snapshot.mockImplementation(async (_id, snap_data, sv) => {
        captured_snapshot_data = snap_data;
        return {
          id: "snap-restore",
          document_id: _id,
          snapshot_data: snap_data,
          state_vector: sv,
          created_at: new Date(),
        };
      });

      // Act
      await service.takeSnapshot(document_id, doc);

      // Assert — el snapshot_data restaura el contenido
      const restored = new Y.Doc();
      Y.applyUpdate(restored, captured_snapshot_data!);
      expect(restored.getText("content").toString()).toBe("restore me");
    });

    /** Verifica que los errores del repositorio en save_snapshot se propaguen */
    it("should_propagate_errors_from_save_snapshot", async () => {
      // Arrange
      const doc = new Y.Doc();
      mock_repo.save_snapshot.mockRejectedValue(new Error("Snapshot write failed"));

      // Act & Assert
      await expect(service.takeSnapshot("doc-fail", doc)).rejects.toThrow("Snapshot write failed");
    });
  });
});

/**
 * Tests de integración ligera de persistencia con Y.js.
 * Verifica el ciclo completo: escribir → serializar → deserializar → verificar.
 */
describe("Y.js serialization round-trip", () => {
  /** Verifica que encodeStateAsUpdate + applyUpdate reproduzca estado exacto */
  it("should_roundtrip_ytext_content_through_uint8array", () => {
    // Arrange
    const original = new Y.Doc();
    original.getText("content").insert(0, "round-trip content");

    // Act
    const serialized = Y.encodeStateAsUpdate(original);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, serialized);

    // Assert
    expect(restored.getText("content").toString()).toBe("round-trip content");
  });

  /** Verifica que múltiples updates serializados se apliquen correctamente */
  it("should_apply_multiple_serialized_updates_producing_final_state", () => {
    // Arrange
    const update_docs: Uint8Array[] = [];
    const source = new Y.Doc();

    // Simular tres actualizaciones incrementales capturadas como events
    source.on("update", (u: Uint8Array) => update_docs.push(u));
    source.getText("content").insert(0, "first");
    source.getText("content").insert(5, "-second");
    source.getText("content").insert(12, "-third");

    // Act — aplicar todos los updates en un doc nuevo
    const target = new Y.Doc();
    for (const u of update_docs) {
      Y.applyUpdate(target, u);
    }

    // Assert
    expect(target.getText("content").toString()).toBe("first-second-third");
  });

  /** Verifica que un YDoc vacío serialice y deserialice sin errores */
  it("should_roundtrip_empty_doc_without_errors", () => {
    // Arrange
    const empty_doc = new Y.Doc();

    // Act
    const serialized = Y.encodeStateAsUpdate(empty_doc);
    const restored = new Y.Doc();

    // Assert — no debe lanzar excepción
    expect(() => Y.applyUpdate(restored, serialized)).not.toThrow();
    expect(restored.getText("content").toString()).toBe("");
  });
});
