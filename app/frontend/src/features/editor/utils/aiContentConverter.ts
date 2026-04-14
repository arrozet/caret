import { generateJSON } from "@tiptap/core";
import type { JSONContent } from "@tiptap/react";
import { create_document_schema_extensions } from "./editorExtensions";

/**
 * Convert an AI proposal into the editor's Tiptap JSON document model.
 *
 * Markdown is handled by wrapping the content in simple HTML and letting
 * Tiptap's schema-aware HTML parser resolve nodes and marks.
 * Plain text still becomes paragraph-based JSON.
 */
export function convert_ai_content_to_tiptap_json(content: string): JSONContent {
  const normalized_content = content.replace(/\r\n/g, "\n").trim();

  if (!normalized_content) {
    return {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
  }

  if (is_plain_text_like(normalized_content)) {
    return {
      type: "doc",
      content: normalized_content
        .split("\n")
        .map((line) =>
          line.trim()
            ? { type: "paragraph", content: [{ type: "text", text: line }] }
            : { type: "paragraph" },
        ),
    };
  }

  const html = markdown_to_html(normalized_content);
  return generateJSON(html, create_document_schema_extensions()) as JSONContent;
}

function is_plain_text_like(content: string): boolean {
  return !["#", "*", "`", "[", "]", "<", ">", "|", "_", "~"].some((marker) =>
    content.includes(marker),
  );
}

function markdown_to_html(markdown: string): string {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith("# ")) {
        return `<h1>${inline_markdown_to_html(block.slice(2))}</h1>`;
      }

      if (block.startsWith("## ")) {
        return `<h2>${inline_markdown_to_html(block.slice(3))}</h2>`;
      }

      if (block.startsWith("### ")) {
        return `<h3>${inline_markdown_to_html(block.slice(4))}</h3>`;
      }

      if (/^(- |\* |\d+\. )/.test(block)) {
        const items = block
          .split("\n")
          .map((line) => line.replace(/^(- |\* |\d+\. )/, "").trim())
          .filter(Boolean)
          .map((item) => `<li>${inline_markdown_to_html(item)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }

      if (block.startsWith("> ")) {
        const quote = block.replace(/^>\s?/gm, "").trim();
        return `<blockquote><p>${inline_markdown_to_html(quote)}</p></blockquote>`;
      }

      if (block.startsWith("```")) {
        const code = block.replace(/^```[\w-]*\n?/, "").replace(/\n```$/, "");
        return `<pre><code>${escape_html(code)}</code></pre>`;
      }

      if (/^\|.*\|$/.test(block.split("\n")[0] ?? "")) {
        const rows = block.split("\n").filter((line) => line.includes("|"));
        const [header, ...body] = rows;
        const headers = split_table_row(header)
          .map((cell) => `<th><p>${inline_markdown_to_html(cell)}</p></th>`)
          .join("");
        const body_rows = body
          .map((row) => {
            if (/^\|?\s*[:\- ]+\|/.test(row)) return "";
            const cells = split_table_row(row)
              .map((cell) => `<td><p>${inline_markdown_to_html(cell)}</p></td>`)
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");
        return `<table><thead><tr>${headers}</tr></thead><tbody>${body_rows}</tbody></table>`;
      }

      if (/^(---|\*\*\*|___)$/.test(block)) {
        return "<hr />";
      }

      if (/^- \[( |x|X)\] /.test(block)) {
        const items = block
          .split("\n")
          .map((line) => {
            const match = line.match(/^- \[([ xX])\] (.*)$/);
            if (!match) return "";
            const checked = match[1].toLowerCase() === "x" ? "true" : "false";
            return `<li data-type="taskItem" data-checked="${checked}"><p>${inline_markdown_to_html(match[2])}</p></li>`;
          })
          .filter(Boolean)
          .join("");
        return `<ul data-type="taskList">${items}</ul>`;
      }

      return `<p>${inline_markdown_to_html(block)}</p>`;
    })
    .join("");

  return blocks || "<p></p>";
}

function inline_markdown_to_html(text: string): string {
  return escape_html(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

function split_table_row(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function escape_html(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
