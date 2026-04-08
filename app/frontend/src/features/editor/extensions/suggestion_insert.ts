import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Inline mark used for suggested insertions.
 * Rendered as underlined, highlighted text in the editor.
 */
export const SuggestionInsert = Mark.create({
  name: "suggestion_insert",

  inclusive: false,

  parseHTML() {
    return [{ tag: "span[data-suggestion-insert]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-suggestion-insert": "true",
        class: "suggestion-insert",
      }),
      0,
    ];
  },
});
