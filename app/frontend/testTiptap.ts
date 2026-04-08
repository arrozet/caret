import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

const editor = new Editor({
  extensions: [StarterKit],
  content: "<p>Original</p>",
});

console.log("Before:", editor.getHTML());
editor.commands.setContent("<p>Preview</p>", { emitUpdate: false });
console.log("After:", editor.getHTML());
