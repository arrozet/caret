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

const html = "<p><h2>Title</h2></p><p>Hola caraca</p>";
const result = editor.commands.setContent(html);
console.log("Result:", result);
console.log("After:", editor.getHTML());
