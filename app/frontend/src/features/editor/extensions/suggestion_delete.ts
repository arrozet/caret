import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Inline mark used for suggested deletions.
 * Rendered as strikethrough text in the editor.
 */
export const SuggestionDelete = Mark.create({
  name: "suggestion_delete",

  inclusive: false,

  parseHTML() {
    return [{ tag: "span[data-suggestion-delete]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-suggestion-delete": "true",
        class: "suggestion-delete",
      }),
      0,
    ];
  },
});
