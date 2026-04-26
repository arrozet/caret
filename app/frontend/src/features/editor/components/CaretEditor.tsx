import { useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent, Editor } from "@tiptap/react";
import { EditorToolbar } from "./EditorToolbar";
import { SelectionMenu } from "./SelectionMenu";
import type { PaperSize } from "../extensions/pagination";
import type * as Y from "yjs";
import { create_editor_extensions } from "../utils";

/**
 * Props for the CaretEditor component.
 */
interface CaretEditorProps {
  /** Initial document content as Tiptap/ProseMirror JSON. */
  content?: JSONContent;
  /** Callback fired whenever the editor content changes. */
  onUpdate?: (json: JSONContent, text: string) => void;
  /** Whether the editor is read-only. */
  editable?: boolean;
  /** Callback to expose the editor instance to parent components. */
  onEditorReady?: (editor: Editor) => void;
  /** Shared Y.js document for real-time collaboration mode. */
  collaborationDocument?: Y.Doc | null;
  /**
   * Controlled paper size. When provided the toolbar is not rendered
   * internally — the parent is responsible for rendering EditorToolbar.
   */
  paperSize?: PaperSize;
  /** Called when the user changes the paper size via the internal toolbar. */
  onPaperSizeChange?: (size: PaperSize) => void;
  /**
   * When true, the built-in toolbar is hidden. Use this when the parent
   * renders EditorToolbar externally (e.g. as a full-width bar).
   */
  hideToolbar?: boolean;
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
  onUpdate,
  editable = true,
  onEditorReady,
  collaborationDocument = null,
  paperSize: externalPaperSize,
  onPaperSizeChange,
  hideToolbar = false,
}: CaretEditorProps) {
  const [internalPaperSize, setInternalPaperSize] = useState<PaperSize>("a4");

  // Use external paper size when controlled, otherwise internal state.
  const paperSize = externalPaperSize ?? internalPaperSize;
  const setPaperSize = onPaperSizeChange ?? setInternalPaperSize;

  const editor = useEditor(
    {
      extensions: create_editor_extensions({
        paper_size: paperSize,
        collaboration_document: collaborationDocument,
      }),
      content: collaborationDocument
        ? undefined
        : (content ?? {
            type: "doc",
            content: [{ type: "paragraph" }],
          }),
      editable,
      editorProps: {
        attributes: {
          class: "caret-editor outline-none",
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (onUpdate) {
          onUpdate(ed.getJSON(), ed.getText());
        }
      },
      onCreate: ({ editor: ed }) => {
        if (onEditorReady) {
          onEditorReady(ed);
        }
      },
    },
    [collaborationDocument, editable],
  );

  // Keep the Pagination extension in sync with the selected paper size.
  useEffect(() => {
    if (editor) {
      editor.extensionManager.extensions
        .filter((ext) => ext.name === "pagination")
        .forEach((ext) => {
          ext.options.paperSize = paperSize;
        });
      // Trigger a re-render of decorations by dispatching a no-op transaction.
      editor.view.dispatch(editor.state.tr);
    }
  }, [paperSize, editor]);

  return (
    <div className="flex flex-col h-full w-full bg-app">
      {/* Internal toolbar — rendered only when not controlled externally */}
      {editable && editor && !hideToolbar && (
        <div className="shrink-0 z-30 w-full border-b border-border-subtle bg-surface shadow-subtle flex justify-center">
          <div className="w-full max-w-[var(--max-width-document-wide)]">
            <EditorToolbar editor={editor} paperSize={paperSize} setPaperSize={setPaperSize} />
          </div>
        </div>
      )}

      {/* Floating selection menu — appears above selected text (z-40) */}
      {editable && editor && <SelectionMenu editor={editor} />}

      {/* Editor Content Area - Scrollable container for the "Paper" */}
      <div className="flex-1 overflow-y-auto bg-app p-4 sm:p-8 md:py-12 flex flex-col items-center">
        <div className={`editor-canvas paper-size-${paperSize} w-full flex justify-center`}>
          <EditorContent editor={editor} className="w-full max-w-full" />
        </div>
      </div>
    </div>
  );
}
