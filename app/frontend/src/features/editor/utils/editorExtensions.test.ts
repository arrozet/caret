import { TiptapTransformer } from "@hocuspocus/transformer";
import type { JSONContent } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  COLLABORATION_FIELD,
  create_document_schema_extensions,
  replace_collaboration_document_content,
} from "./editorExtensions";

describe("editorExtensions", () => {
  it("replaces the current collaboration fragment with new JSON content", () => {
    const original_content: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Texto original" }],
        },
      ],
    };

    const proposed_content: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Texto actualizado" }],
        },
      ],
    };

    const seed_doc = TiptapTransformer.toYdoc(
      original_content,
      COLLABORATION_FIELD,
      create_document_schema_extensions(),
    );
    const collaboration_doc = new Y.Doc();

    Y.applyUpdate(collaboration_doc, Y.encodeStateAsUpdate(seed_doc));

    expect(TiptapTransformer.fromYdoc(collaboration_doc, COLLABORATION_FIELD)).toEqual(
      original_content,
    );

    expect(replace_collaboration_document_content(collaboration_doc, proposed_content)).toBe(true);

    expect(TiptapTransformer.fromYdoc(collaboration_doc, COLLABORATION_FIELD)).toEqual(
      proposed_content,
    );

    seed_doc.destroy();
    collaboration_doc.destroy();
  });
});
