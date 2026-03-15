/**
 * GhostText Tiptap extension.
 *
 * Renders an inline ghost text suggestion after the cursor position.
 * The ghost text is shown in a muted, italic style to indicate it is
 * a suggestion that has not yet been applied to the document.
 *
 * Usage:
 *   editor.commands.setGhostText("suggested text")  // show suggestion
 *   editor.commands.clearGhostText()                 // hide suggestion
 *
 * The ghost text is NOT part of the document content — it lives only in
 * the ProseMirror plugin state and is rendered via a Decoration widget.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { TextSelection } from "@tiptap/pm/state";

/** Plugin key for accessing the ghost text plugin state. */
export const ghost_text_plugin_key = new PluginKey<string>("ghost_text");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    ghost_text: {
      /** Display ghost text at the current cursor position. */
      setGhostText: (text: string) => ReturnType;
      /** Remove the current ghost text suggestion. */
      clearGhostText: () => ReturnType;
    };
  }
}

/** GhostText extension — inline suggestion rendered as a decoration widget. */
export const GhostText = Extension.create({
  name: "ghost_text",

  addCommands() {
    return {
      setGhostText:
        (text: string) =>
        ({ dispatch, tr }) => {
          if (dispatch) {
            tr.setMeta(ghost_text_plugin_key, { type: "set", text });
            dispatch(tr);
          }
          return true;
        },
      clearGhostText:
        () =>
        ({ dispatch, tr }) => {
          if (dispatch) {
            tr.setMeta(ghost_text_plugin_key, { type: "clear" });
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<string>({
        key: ghost_text_plugin_key,

        state: {
          /** Initialises the plugin state to an empty string (no suggestion). */
          init: () => "",

          /**
           * Transitions the plugin state based on incoming transactions.
           *
           * - If the transaction carries a "set" meta, the new suggestion text
           *   is stored.
           * - If the transaction carries a "clear" meta, the suggestion is
           *   removed.
           * - If the document content changed (user typed), the suggestion is
           *   cleared automatically because it is now stale.
           */
          apply(tr, current_text) {
            const meta = tr.getMeta(ghost_text_plugin_key) as
              | { type: "set"; text: string }
              | { type: "clear" }
              | undefined;

            if (meta?.type === "set") return meta.text;
            if (meta?.type === "clear") return "";

            // Clear ghost text when the document content changes
            // (user typed something — suggestion is stale).
            if (tr.docChanged) return "";

            return current_text;
          },
        },

        props: {
          /**
           * Renders the ghost text as a non-editable widget decoration
           * positioned immediately after the cursor.
           */
          decorations(state) {
            const ghost_text = ghost_text_plugin_key.getState(state) ?? "";
            if (!ghost_text) return DecorationSet.empty;

            const selection = state.selection as TextSelection;
            const cursor = selection.$cursor;
            if (!cursor) return DecorationSet.empty;

            const widget = Decoration.widget(cursor.pos, () => {
              const span = document.createElement("span");
              span.className =
                "ghost-text pointer-events-none select-none text-neutral-400 italic opacity-60";
              span.textContent = ghost_text;
              span.setAttribute("data-testid", "ghost-text-widget");
              return span;
            });

            return DecorationSet.create(state.doc, [widget]);
          },
        },
      }),
    ];
  },
});
