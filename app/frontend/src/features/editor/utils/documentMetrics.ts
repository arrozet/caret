/** User-facing document metrics derived from the editor plain-text snapshot. */
export interface DocumentMetrics {
  /** Total characters, including whitespace. */
  character_count: number;
  /** Total characters, excluding all whitespace. */
  character_count_without_spaces: number;
  /** Total whitespace-delimited words. */
  word_count: number;
  /** Total non-empty text blocks separated by line breaks. */
  paragraph_count: number;
}

/** Normalize line endings so metrics are stable across platforms. */
function normalize_text(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Count the editor text using the same deterministic rules as the AI metric tools. */
export function get_document_metrics(text: string): DocumentMetrics {
  const normalized_text = normalize_text(text);
  const stripped_text = normalized_text.trim();

  return {
    character_count: normalized_text.length,
    character_count_without_spaces: normalized_text.replace(/\s+/g, "").length,
    word_count: normalized_text.match(/\S+/g)?.length ?? 0,
    paragraph_count: stripped_text
      ? stripped_text.split(/\n+/).filter((segment) => segment.trim()).length
      : 0,
  };
}
