import { describe, it, expect } from "vitest";
import * as Y from "yjs";

/**
 * Unit tests for Y.js CRDT core operations.
 * Verifica merge determinístico, aplicación de updates, snapshots e invariantes
 * de la librería yjs tal como se usará en el collab-service.
 * Estos tests validan el comportamiento del motor CRDT antes de
 * integrarlo con la capa de persistencia y WebSocket.
 */
describe("Y.js CRDT core", () => {
  /**
   * Tests de creación y estructura básica del documento Y.js.
   */
  describe("YDoc creation", () => {
    /** Verifica que se pueda crear un YDoc vacío sin errores */
    it("should_create_empty_ydoc", () => {
      // Arrange & Act
      const doc = new Y.Doc();

      // Assert
      expect(doc).toBeInstanceOf(Y.Doc);
    });

    /** Verifica que un YDoc nuevo tenga clientID numérico */
    it("should_have_numeric_client_id", () => {
      // Arrange & Act
      const doc = new Y.Doc();

      // Assert
      expect(typeof doc.clientID).toBe("number");
      expect(doc.clientID).toBeGreaterThan(0);
    });

    /** Verifica que dos YDoc distintos tengan clientIDs distintos */
    it("should_generate_unique_client_ids_for_different_docs", () => {
      // Arrange
      const doc_a = new Y.Doc();
      const doc_b = new Y.Doc();

      // Act & Assert
      expect(doc_a.clientID).not.toBe(doc_b.clientID);
    });
  });

  /**
   * Tests de YText — tipo de texto colaborativo de Y.js.
   */
  describe("YText operations", () => {
    /** Verifica que insert en YText produzca el contenido correcto */
    it("should_insert_text_into_ytext", () => {
      // Arrange
      const doc = new Y.Doc();
      const text = doc.getText("content");

      // Act
      text.insert(0, "Hello, Caret!");

      // Assert
      expect(text.toString()).toBe("Hello, Caret!");
    });

    /** Verifica que delete elimine caracteres en la posición correcta */
    it("should_delete_characters_from_ytext", () => {
      // Arrange
      const doc = new Y.Doc();
      const text = doc.getText("content");
      text.insert(0, "Hello World");

      // Act
      text.delete(5, 6); // elimina " World"

      // Assert
      expect(text.toString()).toBe("Hello");
    });

    /** Verifica que insert en posición intermedia sea correcto */
    it("should_insert_in_middle_of_ytext", () => {
      // Arrange
      const doc = new Y.Doc();
      const text = doc.getText("content");
      text.insert(0, "Hello World");

      // Act
      text.insert(5, ", beautiful");

      // Assert
      expect(text.toString()).toBe("Hello, beautiful World");
    });

    /** Verifica que YText vacío devuelva cadena vacía */
    it("should_return_empty_string_for_new_ytext", () => {
      // Arrange
      const doc = new Y.Doc();
      const text = doc.getText("content");

      // Act & Assert
      expect(text.toString()).toBe("");
    });
  });

  /**
   * Tests de serialización y aplicación de updates — núcleo del protocolo de sync.
   */
  describe("update encoding and application", () => {
    /** Verifica que encodeStateAsUpdate produzca un Uint8Array no vacío */
    it("should_encode_state_as_non_empty_update", () => {
      // Arrange
      const doc = new Y.Doc();
      doc.getText("content").insert(0, "test content");

      // Act
      const update = Y.encodeStateAsUpdate(doc);

      // Assert
      expect(update).toBeInstanceOf(Uint8Array);
      expect(update.length).toBeGreaterThan(0);
    });

    /** Verifica que applyUpdate sincronice el contenido entre dos docs */
    it("should_apply_update_from_one_doc_to_another", () => {
      // Arrange
      const doc_a = new Y.Doc();
      const doc_b = new Y.Doc();
      doc_a.getText("content").insert(0, "synced content");

      // Act
      const update = Y.encodeStateAsUpdate(doc_a);
      Y.applyUpdate(doc_b, update);

      // Assert
      expect(doc_b.getText("content").toString()).toBe("synced content");
    });

    /** Verifica que aplicar el mismo update dos veces sea idempotente */
    it("should_be_idempotent_when_same_update_applied_twice", () => {
      // Arrange
      const doc_a = new Y.Doc();
      const doc_b = new Y.Doc();
      doc_a.getText("content").insert(0, "idempotent");
      const update = Y.encodeStateAsUpdate(doc_a);

      // Act
      Y.applyUpdate(doc_b, update);
      Y.applyUpdate(doc_b, update); // segunda aplicación debe ser no-op

      // Assert
      expect(doc_b.getText("content").toString()).toBe("idempotent");
    });

    /** Verifica que encodeStateAsUpdate de un doc vacío sea un Uint8Array */
    it("should_encode_empty_doc_as_uint8array", () => {
      // Arrange
      const doc = new Y.Doc();

      // Act
      const update = Y.encodeStateAsUpdate(doc);

      // Assert
      expect(update).toBeInstanceOf(Uint8Array);
    });
  });

  /**
   * Tests de merge CRDT — propiedad fundamental de convergencia.
   */
  describe("CRDT merge convergence", () => {
    /** Verifica que dos docs con ediciones concurrentes converjan al mismo estado */
    it("should_converge_concurrent_edits_to_same_state", () => {
      // Arrange
      const doc_origin = new Y.Doc();
      doc_origin.getText("content").insert(0, "base");

      // Sincronizar doc_a y doc_b desde el origen
      const doc_a = new Y.Doc();
      const doc_b = new Y.Doc();
      Y.applyUpdate(doc_a, Y.encodeStateAsUpdate(doc_origin));
      Y.applyUpdate(doc_b, Y.encodeStateAsUpdate(doc_origin));

      // Act — ediciones concurrentes
      doc_a.getText("content").insert(4, " alice");
      doc_b.getText("content").insert(4, " bob");

      // Intercambiar updates
      Y.applyUpdate(doc_a, Y.encodeStateAsUpdate(doc_b));
      Y.applyUpdate(doc_b, Y.encodeStateAsUpdate(doc_a));

      // Assert — ambos docs deben tener el mismo estado final
      expect(doc_a.getText("content").toString()).toBe(
        doc_b.getText("content").toString()
      );
    });

    /** Verifica que merge de docs idénticos no duplique contenido */
    it("should_not_duplicate_content_when_merging_identical_docs", () => {
      // Arrange
      const doc_a = new Y.Doc();
      const doc_b = new Y.Doc();
      doc_a.getText("content").insert(0, "hello");
      const update = Y.encodeStateAsUpdate(doc_a);
      Y.applyUpdate(doc_b, update);

      // Act — ambos tienen el mismo estado, aplicar update de b en a
      Y.applyUpdate(doc_a, Y.encodeStateAsUpdate(doc_b));

      // Assert
      expect(doc_a.getText("content").toString()).toBe("hello");
    });

    /** Verifica que el merge sea conmutativo (A←B luego B←A == B←A luego A←B) */
    it("should_produce_same_result_regardless_of_merge_order", () => {
      // Arrange
      const doc_1 = new Y.Doc();
      const doc_2 = new Y.Doc();
      doc_1.getText("content").insert(0, "first");
      doc_2.getText("content").insert(0, "second");

      // Act — orden 1: merge doc_2 en doc_1
      const result_doc_1 = new Y.Doc();
      Y.applyUpdate(result_doc_1, Y.encodeStateAsUpdate(doc_1));
      Y.applyUpdate(result_doc_1, Y.encodeStateAsUpdate(doc_2));

      // Orden 2: merge doc_1 en doc_2
      const result_doc_2 = new Y.Doc();
      Y.applyUpdate(result_doc_2, Y.encodeStateAsUpdate(doc_2));
      Y.applyUpdate(result_doc_2, Y.encodeStateAsUpdate(doc_1));

      // Assert — conmutatividad garantiza mismo resultado
      expect(result_doc_1.getText("content").toString()).toBe(
        result_doc_2.getText("content").toString()
      );
    });
  });

  /**
   * Tests de snapshots — base del mecanismo de persistencia periódica.
   */
  describe("snapshots", () => {
    /** Verifica que snapshot capture el estado del documento */
    it("should_capture_document_state_in_snapshot", () => {
      // Arrange
      const doc = new Y.Doc();
      doc.getText("content").insert(0, "snapshot content");

      // Act
      const snapshot = Y.snapshot(doc);

      // Assert
      expect(snapshot).toBeDefined();
      expect(snapshot).toBeInstanceOf(Y.Snapshot);
    });

    /** Verifica que encodeSnapshot produzca un Uint8Array serializable */
    it("should_encode_snapshot_as_uint8array", () => {
      // Arrange
      const doc = new Y.Doc();
      doc.getText("content").insert(0, "to snapshot");
      const snap = Y.snapshot(doc);

      // Act
      const encoded = Y.encodeSnapshot(snap);

      // Assert
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);
    });

    /** Verifica que decodeSnapshot restaure el objeto Snapshot */
    it("should_decode_snapshot_back_to_snapshot_object", () => {
      // Arrange
      const doc = new Y.Doc();
      doc.getText("content").insert(0, "roundtrip");
      const snap = Y.snapshot(doc);
      const encoded = Y.encodeSnapshot(snap);

      // Act
      const decoded = Y.decodeSnapshot(encoded);

      // Assert
      expect(decoded).toBeInstanceOf(Y.Snapshot);
    });

    /** Verifica que dos snapshots del mismo doc sean iguales (equalSnapshots) */
    it("should_consider_snapshots_of_same_state_as_equal", () => {
      // Arrange
      const doc = new Y.Doc();
      doc.getText("content").insert(0, "equal test");

      // Act
      const snap_a = Y.snapshot(doc);
      const snap_b = Y.snapshot(doc);

      // Assert
      expect(Y.equalSnapshots(snap_a, snap_b)).toBe(true);
    });

    /** Verifica que snapshots antes/después de edición sean distintos */
    it("should_consider_snapshots_different_after_edit", () => {
      // Arrange
      const doc = new Y.Doc();
      doc.getText("content").insert(0, "initial");
      const snap_before = Y.snapshot(doc);

      // Act
      doc.getText("content").insert(7, " edited");
      const snap_after = Y.snapshot(doc);

      // Assert
      expect(Y.equalSnapshots(snap_before, snap_after)).toBe(false);
    });
  });

  /**
   * Tests de encodeStateVector — para sincronización diferencial.
   */
  describe("state vector for differential sync", () => {
    /** Verifica que encodeStateVector produzca un Uint8Array */
    it("should_encode_state_vector_as_uint8array", () => {
      // Arrange
      const doc = new Y.Doc();
      doc.getText("content").insert(0, "vector test");

      // Act
      const sv = Y.encodeStateVector(doc);

      // Assert
      expect(sv).toBeInstanceOf(Uint8Array);
      expect(sv.length).toBeGreaterThan(0);
    });

    /** Verifica que encodeStateAsUpdate con state vector solo incluya diferencias */
    it("should_encode_only_diff_when_state_vector_provided", () => {
      // Arrange
      const doc_a = new Y.Doc();
      const doc_b = new Y.Doc();
      doc_a.getText("content").insert(0, "shared");
      Y.applyUpdate(doc_b, Y.encodeStateAsUpdate(doc_a));

      // Capturar state vector de doc_b (conoce "shared")
      const sv_b = Y.encodeStateVector(doc_b);

      // doc_a agrega contenido nuevo
      doc_a.getText("content").insert(6, " extra");

      // Act — diff solo desde sv_b
      const diff_update = Y.encodeStateAsUpdate(doc_a, sv_b);

      // Assert — aplicar diff en doc_b produce el estado completo
      Y.applyUpdate(doc_b, diff_update);
      expect(doc_b.getText("content").toString()).toBe("shared extra");
    });
  });

  /**
   * Tests de YMap — para estructuras de datos tipo objeto colaborativo.
   */
  describe("YMap operations", () => {
    /** Verifica que set/get en YMap funcionen correctamente */
    it("should_set_and_get_value_in_ymap", () => {
      // Arrange
      const doc = new Y.Doc();
      const map = doc.getMap("metadata");

      // Act
      map.set("title", "My Document");

      // Assert
      expect(map.get("title")).toBe("My Document");
    });

    /** Verifica que delete en YMap elimine la clave */
    it("should_delete_key_from_ymap", () => {
      // Arrange
      const doc = new Y.Doc();
      const map = doc.getMap("metadata");
      map.set("key", "value");

      // Act
      map.delete("key");

      // Assert
      expect(map.has("key")).toBe(false);
    });

    /** Verifica que YMap se sincronice entre documentos via update */
    it("should_sync_ymap_between_docs_via_update", () => {
      // Arrange
      const doc_a = new Y.Doc();
      const doc_b = new Y.Doc();
      doc_a.getMap("meta").set("author", "Alice");

      // Act
      Y.applyUpdate(doc_b, Y.encodeStateAsUpdate(doc_a));

      // Assert
      expect(doc_b.getMap("meta").get("author")).toBe("Alice");
    });
  });

  /**
   * Tests de transacciones — agrupación atómica de cambios.
   */
  describe("transactions", () => {
    /** Verifica que transact agrupe múltiples operaciones en una sola actualización */
    it("should_group_multiple_operations_in_transaction", () => {
      // Arrange
      const doc = new Y.Doc();
      const updates: Uint8Array[] = [];
      doc.on("update", (update: Uint8Array) => updates.push(update));

      // Act
      doc.transact(() => {
        doc.getText("content").insert(0, "Hello");
        doc.getText("content").insert(5, " World");
      });

      // Assert — una sola actualización para toda la transacción
      expect(updates).toHaveLength(1);
      expect(doc.getText("content").toString()).toBe("Hello World");
    });

    /** Verifica que el evento update se emita después de la transacción */
    it("should_emit_update_event_after_transaction_completes", () => {
      // Arrange
      const doc = new Y.Doc();
      const update_handler = vi.fn();
      doc.on("update", update_handler);

      // Act
      doc.transact(() => {
        doc.getText("content").insert(0, "tx content");
      });

      // Assert
      expect(update_handler).toHaveBeenCalledOnce();
    });
  });
});
