import { Extension } from "@tiptap/core";
import { defaultSelectionBuilder, yCursorPlugin } from "@tiptap/y-tiptap";

/** Awareness instance shape consumed by the Y.js cursor plugin. */
type CursorAwareness = Parameters<typeof yCursorPlugin>[0];

/** Local user details shared through collaboration awareness. */
export interface CollaborationCursorUser {
  id: string;
  name: string;
  color: string;
}

/** Options for the Caret collaboration cursor extension. */
export interface CollaborationCursorOptions {
  provider: {
    awareness: CursorAwareness;
  } | null;
  user: CollaborationCursorUser | undefined;
  render: (user: CollaborationCursorUser) => HTMLElement;
}

/** Storage exposed for compatibility with Tiptap's collaboration cursor API. */
export interface CollaborationCursorStorage {
  users: Array<{ clientId: number } & Record<string, unknown>>;
}

function awarenessStatesToArray(
  states: Map<number, Record<string, unknown>>,
): CollaborationCursorStorage["users"] {
  return Array.from(states.entries()).map(([clientId, state]) => ({
    clientId,
    ...((state.user as Record<string, unknown> | undefined) ?? {}),
  }));
}

/**
 * Collaboration cursor extension wired to @tiptap/y-tiptap.
 *
 * Tiptap's published cursor package imports y-prosemirror directly, while the
 * v3 Collaboration extension uses @tiptap/y-tiptap. Mixing both creates two
 * separate ySyncPluginKey instances, so the cursor plugin cannot find sync
 * state and crashes during editor mount.
 */
export const CollaborationCursor = Extension.create<
  CollaborationCursorOptions,
  CollaborationCursorStorage
>({
  name: "collaborationCursor",

  addOptions() {
    return {
      provider: null,
      user: undefined,
      render: (user: CollaborationCursorUser) => {
        const cursor = document.createElement("span");
        cursor.style.borderColor = user.color;
        cursor.textContent = user.name;
        return cursor;
      },
    };
  },

  addStorage() {
    return {
      users: [],
    };
  },

  addProseMirrorPlugins() {
    const awareness = this.options.provider?.awareness;

    if (!awareness) {
      return [];
    }

    awareness.setLocalStateField("user", this.options.user);
    this.storage.users = awarenessStatesToArray(awareness.states);

    return [
      yCursorPlugin(awareness, {
        cursorBuilder: (user) => this.options.render(user as CollaborationCursorUser),
        selectionBuilder: defaultSelectionBuilder,
      }),
    ];
  },
});
