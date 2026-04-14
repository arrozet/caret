import { describe, expect, it } from "vitest";

describe("convert_ai_content_to_tiptap_json", () => {
  it("keeps markdown formatting as Tiptap JSON", async () => {
    const { convert_ai_content_to_tiptap_json } = await import("./aiContentConverter");

    const result = convert_ai_content_to_tiptap_json(
      "# Title\n\n**Bold** and *italic* with [link](https://example.com)\n\n- Item 1\n- Item 2\n\n> Quote\n\n```ts\nconst x = 1;\n```\n\n---",
    );

    expect(result.type).toBe("doc");
    expect(result.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(result.content?.[1]).toMatchObject({ type: "paragraph" });
    expect(result.content?.[2]).toMatchObject({ type: "bulletList" });
    expect(result.content?.some((node) => node.type === "blockquote")).toBe(true);
    expect(result.content?.some((node) => node.type === "codeBlock")).toBe(true);
    expect(result.content?.some((node) => node.type === "horizontalRule")).toBe(true);
  });

  it("supports task lists and tables through the Markdown manager", async () => {
    const { convert_ai_content_to_tiptap_json } = await import("./aiContentConverter");

    const result = convert_ai_content_to_tiptap_json(
      "- [x] Done\n- [ ] Pending\n\n| A | B |\n| - | - |\n| 1 | 2 |",
    );

    expect(result.type).toBe("doc");
    expect(
      result.content?.some((node) => node.type === "bulletList" || node.type === "taskList"),
    ).toBe(true);
    expect(result.content?.some((node) => node.type === "table")).toBe(true);
  });

  it("falls back to paragraphs for plain text", async () => {
    const { convert_ai_content_to_tiptap_json } = await import("./aiContentConverter");

    const result = convert_ai_content_to_tiptap_json("Hello\nWorld");

    expect(result.type).toBe("doc");
    expect(result.content?.[0]).toMatchObject({ type: "paragraph" });
    expect(result.content?.[0]?.content?.[0]).toMatchObject({ type: "text", text: "Hello" });
  });
});
