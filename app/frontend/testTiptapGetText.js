import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { JSDOM } from "jsdom";

const dom = new JSDOM("");
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const editor = new Editor({
  extensions: [StarterKit],
  content:
    "<h2>Caret will make a million dollars before 2027</h2><p>Hola caracacofasfasdfasdfasdf</p>",
});

console.log("getText:", JSON.stringify(editor.getText()));
