import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CaretEditor } from "./CaretEditor";

/**
 * Unit tests for the CaretEditor Tiptap component.
 * Validates rendering, initial content display, and read-only mode.
 */

describe("CaretEditor", () => {
  it("renders the editor container", () => {
    const { container } = render(<CaretEditor />);

    /* The canvas wrapper with the paper sizing class should be present */
    const canvas = container.querySelector(".editor-canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("renders with default empty content", () => {
    const { container } = render(<CaretEditor />);

    /* Tiptap attaches the caret-editor class to the ProseMirror element */
    const editor_el = container.querySelector(".caret-editor");
    expect(editor_el).toBeInTheDocument();
  });

  it("renders provided initial content", async () => {
    const content = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello World" }],
        },
      ],
    };

    render(<CaretEditor content={content} />);

    /* Tiptap renders text content asynchronously */
    const text = await screen.findByText("Hello World");
    expect(text).toBeInTheDocument();
  });

  it("renders in read-only mode when editable is false", () => {
    const { container } = render(<CaretEditor editable={false} />);

    const prosemirror = container.querySelector("[contenteditable]");
    expect(prosemirror).toHaveAttribute("contenteditable", "false");
  });
});
