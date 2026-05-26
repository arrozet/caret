import { TiptapTransformer } from "@hocuspocus/transformer";
import Collaboration from "@tiptap/extension-collaboration";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import type { JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { GhostText } from "../extensions/GhostText";
import { CollaborationCursor } from "../extensions/CollaborationCursor";
import { SuggestionDelete } from "../extensions/SuggestionDelete";
import { SuggestionInsert } from "../extensions/SuggestionInsert";
import { create_cursor_label } from "../../collaboration/components/RemoteCursor";

/** Shared Y.js field used by the collaboration extension. */
export const COLLABORATION_FIELD = "content";

function create_starter_kit(collaboration_document: Y.Doc | null = null) {
  return StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    // Y.js owns the history stack in collaboration mode.
    undoRedo: collaboration_document ? false : undefined,
    link: false,
    underline: false,
  });
}

/**
 * Content-bearing extensions used to define the document schema.
 * Keep this aligned with the persisted JSON shape sent to/from the backend.
 */
export function create_document_schema_extensions() {
  return [
    create_starter_kit(),
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
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
    Markdown.configure({
      markedOptions: {
        gfm: true,
      },
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
  ];
}

/**
 * Full editor extension list, including collaboration and editor-only UI helpers.
 */
export function create_editor_extensions(
  params: {
    collaboration_document?: Y.Doc | null;
    provider?: WebsocketProvider | null;
    local_user?: { id: string; name: string; color: string };
  } = {},
) {
  const { collaboration_document = null, provider = null, local_user } = params;

  return [
    create_starter_kit(collaboration_document),
    ...(collaboration_document
      ? provider
        ? [
            Collaboration.configure({
              document: collaboration_document,
              field: COLLABORATION_FIELD,
            }),
            CollaborationCursor.configure({
              provider,
              user: local_user,
              render: create_cursor_label,
            }),
          ]
        : [
            Collaboration.configure({
              document: collaboration_document,
              field: COLLABORATION_FIELD,
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
    Markdown.configure({
      markedOptions: {
        gfm: true,
      },
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
    GhostText,
    SuggestionInsert,
    SuggestionDelete,
  ];
}

/**
 * Whether the collaboration fragment is still empty after the first sync.
 */
export function is_collaboration_document_empty(ydoc: Y.Doc): boolean {
  return ydoc.getXmlFragment(COLLABORATION_FIELD).length === 0;
}

/**
 * True when there is persisted JSON worth bootstrapping into a blank Y.Doc.
 */
export function has_bootstrap_content(
  content: JSONContent | null | undefined,
): content is JSONContent {
  return Boolean(
    content &&
    content.type === "doc" &&
    Array.isArray(content.content) &&
    content.content.length > 0,
  );
}

/**
 * Rehydrate a blank collaboration document from persisted Tiptap JSON.
 */
export function bootstrap_collaboration_document(ydoc: Y.Doc, content: JSONContent): boolean {
  if (!has_bootstrap_content(content) || !is_collaboration_document_empty(ydoc)) {
    return false;
  }

  const source_doc = TiptapTransformer.toYdoc(
    content,
    COLLABORATION_FIELD,
    create_document_schema_extensions(),
  );

  try {
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(source_doc));
    return true;
  } finally {
    source_doc.destroy();
  }
}

/**
 * Replace the current collaboration fragment with a new Tiptap JSON document.
 *
 * Collaboration editors render from the shared Y.Doc, so AI accept/reject flows
 * must update the fragment directly instead of only mutating the local editor state.
 */
export function replace_collaboration_document_content(ydoc: Y.Doc, content: JSONContent): boolean {
  if (!has_bootstrap_content(content)) {
    return false;
  }

  const source_doc = TiptapTransformer.toYdoc(
    content,
    COLLABORATION_FIELD,
    create_document_schema_extensions(),
  );

  try {
    const target_fragment = ydoc.getXmlFragment(COLLABORATION_FIELD);

    ydoc.transact(() => {
      if (target_fragment.length > 0) {
        target_fragment.delete(0, target_fragment.length);
      }

      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(source_doc));
    }, "caret-ai-accept");

    return true;
  } finally {
    source_doc.destroy();
  }
}
