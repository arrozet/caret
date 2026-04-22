import { describe, expect, it } from "vitest";
import { build_suggestion_preview_content } from "./suggestionPreview";

/** Unit tests for suggestion preview generation. Validates inline diff markup for AI changes. */
describe("build_suggestion_preview_content", () => {
  /** Verifies that replacements are rendered with delete and insert marks inline. */
  it("marks replaced text with inline suggestion marks", () => {
    // Arrange
    const original = "Texto original";
    const proposed = "Texto actualizado";

    // Act
    const preview = build_suggestion_preview_content(original, proposed);

    // Assert
    expect(preview.type).toBe("doc");
    expect(preview.content?.[0]).toMatchObject({
      type: "paragraph",
      content: [
        { type: "text", text: "Texto " },
        { type: "text", text: "original", marks: [{ type: "suggestion_delete" }] },
        { type: "text", text: "actualizado", marks: [{ type: "suggestion_insert" }] },
      ],
    });
  });

  /** Verifies that inserted lines remain separate paragraphs in the preview document. */
  it("keeps inserted lines as separate paragraphs", () => {
    // Arrange
    const original = "Linea uno\nLinea dos";
    const proposed = "Linea uno\nLinea nueva\nLinea dos";

    // Act
    const preview = build_suggestion_preview_content(original, proposed);

    // Assert
    expect(preview.content?.length).toBe(3);
    expect(preview.content?.[1]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Linea nueva", marks: [{ type: "suggestion_insert" }] }],
    });
  });
});
