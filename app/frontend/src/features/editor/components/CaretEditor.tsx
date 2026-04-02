import { useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Underline from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import type { JSONContent, Editor } from "@tiptap/react";
import { EditorToolbar } from "./EditorToolbar";
import { SelectionMenu } from "./SelectionMenu";
import { Pagination } from "../extensions/pagination";
import type { PaperSize } from "../extensions/pagination";
import { GhostText } from "../extensions/ghost_text";
import type * as Y from "yjs";

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
  /** Callback to expose the editor instance to parent components. */
  on_editor_ready?: (editor: Editor) => void;
  /** Shared Y.js document for real-time collaboration mode. */
  collaboration_document?: Y.Doc | null;
}

/**
 * Core Tiptap rich text editor with Swiss Focus typography.
 *
 * Renders within a centered "sheet" container using the `.caret-editor`
 * CSS class defined in index.css. Includes a full formatting toolbar
 * with bold, italic, underline, headings, lists, alignment, etc., and
 * a floating SelectionMenu that appears on text selection.
 *
 * @param props - Editor configuration and callbacks.
 * @returns The rendered editor component.
 */
export function CaretEditor({
  content,
  on_update,
  editable = true,
  on_editor_ready,
  collaboration_document = null,
}: CaretEditorProps) {
  const [paper_size, set_paper_size] = useState<PaperSize>("a4");

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          // Disable undo/redo when using collaboration (Y.js handles history)
          undoRedo: collaboration_document ? false : undefined,
          // Tiptap v3 StarterKit bundles Link and Underline by default.
          // Disable them here to avoid "Duplicate extension names" warnings;
          // we register both below with our own configuration options.
          link: false,
          underline: false,
        }),
        ...(collaboration_document
          ? [
              Collaboration.configure({
                document: collaboration_document,
                field: "content",
              }),
            ]
          : []),
        TextStyle,
        Color,
        FontFamily.configure({
          types: ["textStyle"],
        }),
        Highlight.configure({
          multicolor: true,
        }),
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
        Placeholder.configure({
          placeholder: "Start writing...",
        }),
        Underline,
        Link.configure({
          openOnClick: false,
          autolink: true,
        }),
        Image,
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
        Pagination.configure({
          paper_size,
        }),
        GhostText,
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
      onCreate: ({ editor: ed }) => {
        if (on_editor_ready) {
          on_editor_ready(ed);
        }
      },
    },
    [collaboration_document, editable],
  );

  // Keep the Pagination extension in sync with the selected paper size.
  useEffect(() => {
    if (editor) {
      editor.extensionManager.extensions
        .filter((ext) => ext.name === "pagination")
        .forEach((ext) => {
          ext.options.paper_size = paper_size;
        });
      // Trigger a re-render of decorations by dispatching a no-op transaction.
      editor.view.dispatch(editor.state.tr);
    }
  }, [paper_size, editor]);

  return (
    <div className="flex flex-col h-full w-full bg-app">
      {/* Formatting Toolbar - Fixed at the top, full width */}
      {editable && editor && (
        <div className="shrink-0 z-30 w-full border-b border-border-subtle bg-surface shadow-subtle flex justify-center">
          <div className="w-full max-w-[var(--max-width-document-wide)]">
            <EditorToolbar
              editor={editor}
              paper_size={paper_size}
              set_paper_size={set_paper_size}
            />
          </div>
        </div>
      )}

      {/* Floating selection menu — appears above selected text (z-40) */}
      {editable && editor && <SelectionMenu editor={editor} />}

      {/* Editor Content Area - Scrollable container for the "Paper" */}
      <div className="flex-1 overflow-y-auto bg-app p-4 sm:p-8 md:py-12 flex flex-col items-center">
        <div className={`editor-canvas paper-size-${paper_size} w-full flex justify-center`}>
          <EditorContent editor={editor} className="w-full max-w-full" />
        </div>
      </div>
    </div>
  );
}
