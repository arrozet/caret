import type { JSONContent } from "@tiptap/react";

/** Inline diff segment used by the suggestion preview builder. */
export interface SuggestionPreviewSegment {
  /** Segment kind. */
  type: "equal" | "removed" | "added";
  /** Segment text. */
  text: string;
}

/** Mark type used for inserted text in preview mode. */
const INSERT_MARK = { type: "suggestion_insert" };
/** Mark type used for deleted text in preview mode. */
const DELETE_MARK = { type: "suggestion_delete" };

const TOKEN_PATTERN = /\s+|[^\s]+/g;

function tokenize_text(text: string): string[] {
  return text.replace(/\r\n/g, "\n").match(TOKEN_PATTERN) ?? [];
}

function build_lcs_table(left: string[], right: string[]): number[][] {
  const table: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array(right.length + 1).fill(0),
  );

  for (let row = left.length - 1; row >= 0; row -= 1) {
    for (let col = right.length - 1; col >= 0; col -= 1) {
      table[row][col] =
        left[row] === right[col]
          ? table[row + 1][col + 1] + 1
          : Math.max(table[row + 1][col], table[row][col + 1]);
    }
  }

  return table;
}

function push_segment(
  segments: SuggestionPreviewSegment[],
  type: SuggestionPreviewSegment["type"],
  text: string,
): void {
  if (!text) return;

  const last_segment = segments.at(-1);
  if (last_segment?.type === type) {
    last_segment.text += text;
    return;
  }

  segments.push({ type, text });
}

function diff_tokens(left: string, right: string): SuggestionPreviewSegment[] {
  const left_tokens = tokenize_text(left);
  const right_tokens = tokenize_text(right);
  const table = build_lcs_table(left_tokens, right_tokens);
  const segments: SuggestionPreviewSegment[] = [];

  let left_index = 0;
  let right_index = 0;

  while (left_index < left_tokens.length || right_index < right_tokens.length) {
    const left_token = left_tokens[left_index];
    const right_token = right_tokens[right_index];

    if (left_token !== undefined && right_token !== undefined && left_token === right_token) {
      push_segment(segments, "equal", left_token);
      left_index += 1;
      right_index += 1;
      continue;
    }

    const remove_score =
      left_token !== undefined ? table[left_index + 1][right_index] : Number.NEGATIVE_INFINITY;
    const add_score =
      right_token !== undefined ? table[left_index][right_index + 1] : Number.NEGATIVE_INFINITY;

    if (left_token !== undefined && remove_score >= add_score) {
      push_segment(segments, "removed", left_token);
      left_index += 1;
      continue;
    }

    if (right_token !== undefined) {
      push_segment(segments, "added", right_token);
      right_index += 1;
    }
  }

  return segments;
}

type LineOperation =
  | { type: "equal"; text: string }
  | { type: "removed"; text: string }
  | { type: "added"; text: string }
  | { type: "replace"; original: string; proposed: string };

function build_line_operations(original: string, proposed: string): LineOperation[] {
  const original_lines = original.replace(/\r\n/g, "\n").split("\n");
  const proposed_lines = proposed.replace(/\r\n/g, "\n").split("\n");
  const table = build_lcs_table(original_lines, proposed_lines);
  const raw_operations: Array<Exclude<LineOperation, { type: "replace" }>> = [];

  let original_index = 0;
  let proposed_index = 0;

  while (original_index < original_lines.length || proposed_index < proposed_lines.length) {
    const original_line = original_lines[original_index];
    const proposed_line = proposed_lines[proposed_index];

    if (
      original_line !== undefined &&
      proposed_line !== undefined &&
      original_line === proposed_line
    ) {
      raw_operations.push({ type: "equal", text: original_line });
      original_index += 1;
      proposed_index += 1;
      continue;
    }

    const remove_score =
      original_line !== undefined
        ? table[original_index + 1][proposed_index]
        : Number.NEGATIVE_INFINITY;
    const add_score =
      proposed_line !== undefined
        ? table[original_index][proposed_index + 1]
        : Number.NEGATIVE_INFINITY;

    if (original_line !== undefined && remove_score >= add_score) {
      raw_operations.push({ type: "removed", text: original_line });
      original_index += 1;
      continue;
    }

    if (proposed_line !== undefined) {
      raw_operations.push({ type: "added", text: proposed_line });
      proposed_index += 1;
    }
  }

  const operations: LineOperation[] = [];
  for (let index = 0; index < raw_operations.length; index += 1) {
    const current = raw_operations[index];
    const next = raw_operations[index + 1];

    if (current?.type === "removed" && next?.type === "added" && current.text !== next.text) {
      operations.push({ type: "replace", original: current.text, proposed: next.text });
      index += 1;
      continue;
    }

    if (current?.type === "added" && next?.type === "removed" && current.text !== next.text) {
      operations.push({ type: "replace", original: next.text, proposed: current.text });
      index += 1;
      continue;
    }

    operations.push(current as LineOperation);
  }

  return operations;
}

function text_node(text: string, marks?: Array<{ type: string }>): JSONContent {
  return marks ? { type: "text", text, marks } : { type: "text", text };
}

function tokens_to_paragraph(segments: SuggestionPreviewSegment[]): JSONContent {
  return {
    type: "paragraph",
    content: segments.flatMap((segment) => {
      if (!segment.text) return [];

      const marks =
        segment.type === "removed"
          ? [DELETE_MARK]
          : segment.type === "added"
            ? [INSERT_MARK]
            : undefined;

      return [text_node(segment.text, marks)];
    }),
  };
}

/**
 * Build a Tiptap document preview that shows inline AI suggestions.
 */
export function build_suggestion_preview_content(original: string, proposed: string): JSONContent {
  const operations = build_line_operations(original, proposed);
  const content: JSONContent[] = [];

  for (const operation of operations) {
    if (operation.type === "equal") {
      content.push({
        type: "paragraph",
        content: operation.text ? [text_node(operation.text)] : undefined,
      });
      continue;
    }

    if (operation.type === "removed") {
      content.push({
        type: "paragraph",
        content: operation.text ? [text_node(operation.text, [DELETE_MARK])] : undefined,
      });
      continue;
    }

    if (operation.type === "added") {
      content.push({
        type: "paragraph",
        content: operation.text ? [text_node(operation.text, [INSERT_MARK])] : undefined,
      });
      continue;
    }

    content.push(tokens_to_paragraph(diff_tokens(operation.original, operation.proposed)));
  }

  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}
