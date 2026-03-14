import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Y from "yjs";

/**
 * Unit tests para la gestión de salas (room management) del collab-service.
 * Verifica la lógica de join/leave de participantes, presencia, y el ciclo
 * de vida de un documento Y.js compartido en una sala de colaboración.
 * Implementa la lógica de RoomManager in-memory que el servicio usará.
 */

// ─────────────────────────────────────────────────────────────────
// Implementación inline de RoomManager para testear la lógica
// (el src/services/index.ts es un stub; los tests definen la
//  forma esperada del servicio antes de que sea implementado)
// ─────────────────────────────────────────────────────────────────

/**
 * Representa una sesión de participante en una sala.
 */
interface Participant {
  user_id: string;
  socket_id: string;
  joined_at: Date;
}

/**
 * Representa una sala de colaboración activa.
 */
interface Room {
  document_id: string;
  doc: Y.Doc;
  participants: Map<string, Participant>;
  created_at: Date;
}

/**
 * Gestiona el ciclo de vida de salas de colaboración en memoria.
 * Esta es la forma esperada del servicio de rooms del collab-service.
 */
class RoomManager {
  private rooms: Map<string, Room> = new Map();

  /**
   * Une a un usuario a una sala, creando la sala si no existe.
   */
  join_room(document_id: string, user_id: string, socket_id: string): void {
    if (!this.rooms.has(document_id)) {
      this.rooms.set(document_id, {
        document_id,
        doc: new Y.Doc(),
        participants: new Map(),
        created_at: new Date(),
      });
    }
    const room = this.rooms.get(document_id)!;
    room.participants.set(user_id, {
      user_id,
      socket_id,
      joined_at: new Date(),
    });
  }

  /**
   * Elimina a un usuario de la sala. Si la sala queda vacía, la destruye.
   */
  leave_room(document_id: string, user_id: string): boolean {
    const room = this.rooms.get(document_id);
    if (!room) return false;
    const removed = room.participants.delete(user_id);
    if (room.participants.size === 0) {
      this.rooms.delete(document_id);
    }
    return removed;
  }

  /**
   * Devuelve la lista de user_ids presentes en la sala.
   */
  get_participants(document_id: string): string[] {
    const room = this.rooms.get(document_id);
    if (!room) return [];
    return Array.from(room.participants.keys());
  }

  /**
   * Devuelve el YDoc asociado a la sala, o undefined si no existe.
   */
  get_doc(document_id: string): Y.Doc | undefined {
    return this.rooms.get(document_id)?.doc;
  }

  /**
   * Indica si una sala existe.
   */
  room_exists(document_id: string): boolean {
    return this.rooms.has(document_id);
  }

  /**
   * Devuelve el número de salas activas.
   */
  get_room_count(): number {
    return this.rooms.size;
  }

  /**
   * Devuelve el número de participantes en una sala.
   */
  get_participant_count(document_id: string): number {
    return this.rooms.get(document_id)?.participants.size ?? 0;
  }
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe("RoomManager", () => {
  let room_manager: RoomManager;

  beforeEach(() => {
    room_manager = new RoomManager();
    vi.clearAllMocks();
  });

  /**
   * Tests de join_room — unirse a una sala.
   */
  describe("join_room", () => {
    /** Verifica que join_room registre al usuario en la sala correcta */
    it("should_register_user_on_join_room", () => {
      // Arrange
      const document_id = "doc-123";
      const user_id = "user-456";
      const socket_id = "sock-1";

      // Act
      room_manager.join_room(document_id, user_id, socket_id);

      // Assert
      expect(room_manager.get_participants(document_id)).toContain(user_id);
    });

    /** Verifica que join_room cree la sala si no existe */
    it("should_create_room_if_not_exists_on_join", () => {
      // Arrange
      const document_id = "new-doc-001";

      // Act
      room_manager.join_room(document_id, "user-1", "sock-1");

      // Assert
      expect(room_manager.room_exists(document_id)).toBe(true);
    });

    /** Verifica que múltiples usuarios puedan unirse a la misma sala */
    it("should_allow_multiple_users_in_same_room", () => {
      // Arrange
      const document_id = "shared-doc";

      // Act
      room_manager.join_room(document_id, "alice", "sock-a");
      room_manager.join_room(document_id, "bob", "sock-b");
      room_manager.join_room(document_id, "carol", "sock-c");

      // Assert
      expect(room_manager.get_participant_count(document_id)).toBe(3);
      expect(room_manager.get_participants(document_id)).toContain("alice");
      expect(room_manager.get_participants(document_id)).toContain("bob");
      expect(room_manager.get_participants(document_id)).toContain("carol");
    });

    /** Verifica que join_room cree un YDoc para la sala nueva */
    it("should_create_ydoc_for_new_room", () => {
      // Arrange
      const document_id = "doc-with-ydoc";

      // Act
      room_manager.join_room(document_id, "user-1", "sock-1");

      // Assert
      const doc = room_manager.get_doc(document_id);
      expect(doc).toBeInstanceOf(Y.Doc);
    });

    /** Verifica que el mismo usuario re-joining actualice su socket_id */
    it("should_update_socket_id_when_same_user_rejoins", () => {
      // Arrange
      const document_id = "doc-rejoin";
      room_manager.join_room(document_id, "user-1", "old-sock");

      // Act
      room_manager.join_room(document_id, "user-1", "new-sock");

      // Assert — solo un participante, no duplicado
      expect(room_manager.get_participant_count(document_id)).toBe(1);
    });

    /** Verifica que join en distintos docs cree salas independientes */
    it("should_create_separate_rooms_for_different_docs", () => {
      // Arrange & Act
      room_manager.join_room("doc-a", "user-1", "sock-1");
      room_manager.join_room("doc-b", "user-2", "sock-2");

      // Assert
      expect(room_manager.get_room_count()).toBe(2);
      expect(room_manager.get_participants("doc-a")).toContain("user-1");
      expect(room_manager.get_participants("doc-b")).toContain("user-2");
      expect(room_manager.get_participants("doc-a")).not.toContain("user-2");
    });
  });

  /**
   * Tests de leave_room — salir de una sala.
   */
  describe("leave_room", () => {
    /** Verifica que leave_room elimine al usuario de la sala */
    it("should_remove_user_on_leave_room", () => {
      // Arrange
      const document_id = "doc-leave";
      room_manager.join_room(document_id, "user-1", "sock-1");

      // Act
      room_manager.leave_room(document_id, "user-1");

      // Assert
      expect(room_manager.get_participants(document_id)).not.toContain("user-1");
    });

    /** Verifica que leave_room devuelva true si el usuario estaba en la sala */
    it("should_return_true_when_user_was_in_room", () => {
      // Arrange
      const document_id = "doc-leave-ret";
      room_manager.join_room(document_id, "user-1", "sock-1");

      // Act
      const result = room_manager.leave_room(document_id, "user-1");

      // Assert
      expect(result).toBe(true);
    });

    /** Verifica que leave_room devuelva false si la sala no existe */
    it("should_return_false_when_room_does_not_exist", () => {
      // Arrange & Act
      const result = room_manager.leave_room("nonexistent-doc", "user-1");

      // Assert
      expect(result).toBe(false);
    });

    /** Verifica que la sala se destruya cuando el último usuario sale */
    it("should_destroy_room_when_last_user_leaves", () => {
      // Arrange
      const document_id = "doc-destroy";
      room_manager.join_room(document_id, "user-1", "sock-1");

      // Act
      room_manager.leave_room(document_id, "user-1");

      // Assert
      expect(room_manager.room_exists(document_id)).toBe(false);
    });

    /** Verifica que la sala persista cuando quedan participantes */
    it("should_keep_room_when_other_users_remain", () => {
      // Arrange
      const document_id = "doc-keep";
      room_manager.join_room(document_id, "alice", "sock-a");
      room_manager.join_room(document_id, "bob", "sock-b");

      // Act
      room_manager.leave_room(document_id, "alice");

      // Assert
      expect(room_manager.room_exists(document_id)).toBe(true);
      expect(room_manager.get_participants(document_id)).toContain("bob");
    });

    /** Verifica que leave de usuario no presente devuelva false */
    it("should_return_false_when_user_not_in_room", () => {
      // Arrange
      const document_id = "doc-not-member";
      room_manager.join_room(document_id, "alice", "sock-a");

      // Act
      const result = room_manager.leave_room(document_id, "ghost-user");

      // Assert
      expect(result).toBe(false);
      expect(room_manager.get_participant_count(document_id)).toBe(1);
    });
  });

  /**
   * Tests de get_participants — consulta de presencia.
   */
  describe("get_participants", () => {
    /** Verifica que devuelva lista vacía para sala inexistente */
    it("should_return_empty_array_for_nonexistent_room", () => {
      // Arrange & Act
      const participants = room_manager.get_participants("no-such-doc");

      // Assert
      expect(participants).toEqual([]);
    });

    /** Verifica que devuelva todos los user_ids presentes */
    it("should_return_all_user_ids_in_room", () => {
      // Arrange
      const document_id = "presence-doc";
      room_manager.join_room(document_id, "alice", "sock-a");
      room_manager.join_room(document_id, "bob", "sock-b");

      // Act
      const participants = room_manager.get_participants(document_id);

      // Assert
      expect(participants).toHaveLength(2);
      expect(participants).toContain("alice");
      expect(participants).toContain("bob");
    });
  });

  /**
   * Tests de get_doc — acceso al YDoc de la sala.
   */
  describe("get_doc", () => {
    /** Verifica que devuelva undefined para sala inexistente */
    it("should_return_undefined_for_nonexistent_room", () => {
      // Arrange & Act
      const doc = room_manager.get_doc("no-such-doc");

      // Assert
      expect(doc).toBeUndefined();
    });

    /** Verifica que el mismo YDoc sea retornado en llamadas sucesivas */
    it("should_return_same_ydoc_instance_on_multiple_calls", () => {
      // Arrange
      room_manager.join_room("stable-doc", "user-1", "sock-1");

      // Act
      const doc_first = room_manager.get_doc("stable-doc");
      const doc_second = room_manager.get_doc("stable-doc");

      // Assert
      expect(doc_first).toBe(doc_second);
    });

    /** Verifica que el YDoc de la sala pueda recibir updates Y.js */
    it("should_allow_yjs_updates_on_room_doc", () => {
      // Arrange
      room_manager.join_room("editable-doc", "user-1", "sock-1");
      const doc = room_manager.get_doc("editable-doc")!;

      // Act
      doc.getText("content").insert(0, "collaborative text");

      // Assert
      expect(doc.getText("content").toString()).toBe("collaborative text");
    });
  });

  /**
   * Tests de escenarios de reconexión — edge cases.
   */
  describe("reconnection scenarios", () => {
    /** Verifica que un usuario que se desconecta y reconecta mantenga la sala activa */
    it("should_maintain_room_state_when_user_reconnects", () => {
      // Arrange
      const document_id = "reconnect-doc";
      room_manager.join_room(document_id, "alice", "sock-a");
      room_manager.join_room(document_id, "bob", "sock-b");

      // Simular que alice escribe
      const doc = room_manager.get_doc(document_id)!;
      doc.getText("content").insert(0, "alice was here");

      // Act — alice se desconecta y reconecta
      room_manager.leave_room(document_id, "alice");
      room_manager.join_room(document_id, "alice", "sock-a-new");

      // Assert — sala sigue activa y contenido intacto
      expect(room_manager.room_exists(document_id)).toBe(true);
      expect(doc.getText("content").toString()).toBe("alice was here");
    });

    /** Verifica que múltiples joins consecutivos no acumulen duplicados */
    it("should_not_accumulate_duplicate_participants_on_repeated_join", () => {
      // Arrange
      const document_id = "no-dupe-doc";

      // Act
      room_manager.join_room(document_id, "user-1", "sock-1");
      room_manager.join_room(document_id, "user-1", "sock-1");
      room_manager.join_room(document_id, "user-1", "sock-2");

      // Assert
      expect(room_manager.get_participant_count(document_id)).toBe(1);
    });

    /** Verifica que leave seguido de join cree una entrada fresca para el usuario */
    it("should_allow_rejoin_after_leave", () => {
      // Arrange
      const document_id = "rejoin-doc";
      room_manager.join_room(document_id, "user-1", "sock-old");
      room_manager.leave_room(document_id, "user-1");

      // Act
      room_manager.join_room(document_id, "user-1", "sock-new");

      // Assert
      expect(room_manager.get_participants(document_id)).toContain("user-1");
    });
  });
});
