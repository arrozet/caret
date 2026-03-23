import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { JSDOM } from "jsdom";

const dom = new JSDOM("");
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const editor = new Editor({
  extensions: [StarterKit],
  content: "<p>Original</p>",
});

console.log("Before:", editor.getHTML());
const result = editor.commands.insertContentAt(
  { from: 0, to: editor.state.doc.content.size },
  "<p>Preview</p>",
);
console.log("Result:", result);
console.log("After:", editor.getHTML());
