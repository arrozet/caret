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

const proposed_text =
  "Caret will make a million dollars before 2027\n\nHola caracacofasfasdfasdfasdf";
const to_editor_html = (text) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

const html = to_editor_html(proposed_text);
console.log("HTML:", html);

editor.commands.setContent(html);
console.log("After:", editor.getHTML());
