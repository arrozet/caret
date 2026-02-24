import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/react";

/**
 * Props for the CaretEditor component.
 */
interface CaretEditorProps {
  /** Initial document content as Tiptap/ProseMirror JSON. */
  content?: JSONContent;
  /** Callback fired whenever the editor content changes. */
  on_update?: (json: JSONContent, text: string) => void;
  /** Whether the editor is read-only. */
  editable?: boolean;
}

/**
 * Core Tiptap rich text editor with Swiss Focus typography.
 *
 * Renders within a centered "sheet" container using the `.caret-editor`
 * CSS class defined in index.css. Extensions include StarterKit
 * (headings, bold, italic, lists, blockquote, code).
 *
 * @param props - Editor configuration and callbacks.
 * @returns The rendered editor component.
 */
export function CaretEditor({
  content,
  on_update,
  editable = true,
}: CaretEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
    ],
    content: content ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
    editable,
    editorProps: {
      attributes: {
        class: "caret-editor outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (on_update) {
        on_update(ed.getJSON(), ed.getText());
      }
    },
  });

  return (
    <div className="mx-auto w-full max-w-[var(--max-width-document)] bg-surface rounded-none shadow-subtle p-8 min-h-[60vh]">
      <EditorContent editor={editor} />
    </div>
  );
}
