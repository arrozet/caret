import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent, Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { EditorToolbar } from "./EditorToolbar";
import { SelectionMenu } from "./SelectionMenu";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
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
  /** WebSocket provider for collaboration cursor rendering. */
  collaborationProvider?: WebsocketProvider | null;
  /** Local user metadata for collaboration cursor label. */
  localUser?: { id: string; name: string; color: string };
  /**
   * When true, the built-in toolbar is hidden. Use this when the parent
   * renders EditorToolbar externally (e.g. as a full-width bar).
   */
  hideToolbar?: boolean;
}

/**
 * Core Tiptap rich text editor with Swiss Focus typography.
 *
 * Renders within a centered continuous document surface using the
 * `.caret-editor` CSS class defined in index.css. Includes a full
 * formatting toolbar and a floating SelectionMenu that appears on text
 * selection.
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
  collaborationProvider = null,
  localUser,
  hideToolbar = false,
}: CaretEditorProps) {
  const ready_editor_ref = useRef<Editor | null>(null);
  const editor = useEditor(
    {
      extensions: create_editor_extensions({
        collaboration_document: collaborationDocument,
        provider: collaborationProvider,
        local_user: localUser,
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
    },
    [collaborationDocument, collaborationProvider, editable],
  );

  useEffect(() => {
    if (!editor || !onEditorReady || ready_editor_ref.current === editor) {
      return;
    }

    ready_editor_ref.current = editor;
    onEditorReady(editor);
  }, [editor, onEditorReady]);

  return (
    <div className="flex flex-col h-full w-full bg-app">
      {editable && editor && !hideToolbar && (
        <div className="shrink-0 z-30 w-full border-b border-border-subtle bg-surface shadow-subtle flex justify-center">
          <div className="w-full max-w-[var(--max-width-document-wide)]">
            <EditorToolbar editor={editor} />
          </div>
        </div>
      )}

      {editable && editor && <SelectionMenu editor={editor} />}

      <div className="flex-1 overflow-y-auto bg-app p-4 sm:p-8 md:py-12 flex flex-col items-center">
        <div className="editor-canvas w-full flex justify-center">
          <EditorContent editor={editor} className="w-full max-w-full" />
        </div>
      </div>
    </div>
  );
}
