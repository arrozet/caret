import { describe, expect, it } from "vitest";
import { get_document_metrics } from "./documentMetrics";

/** Unit tests for editor document metrics. Validates parity with AI metric tool semantics. */
describe("get_document_metrics", () => {
  /** Counts words, characters, and non-empty paragraph blocks from editor plain text. */
  it("counts document metrics from normalized plain text", () => {
    // Arrange
    const text = "Uno dos\r\n\r\nTres\n  \nCuatro cinco";

    // Act
    const metrics = get_document_metrics(text);

    // Assert
    expect(metrics).toEqual({
      character_count: 29,
      character_count_without_spaces: 21,
      word_count: 5,
      paragraph_count: 3,
    });
  });

  /** Empty or whitespace-only documents should produce zero user-facing metrics. */
  it("returns zero metrics for whitespace-only text", () => {
    // Arrange
    const text = "   \n\n  ";

    // Act
    const metrics = get_document_metrics(text);

    // Assert
    expect(metrics).toEqual({
      character_count: 7,
      character_count_without_spaces: 0,
      word_count: 0,
      paragraph_count: 0,
    });
  });
});
