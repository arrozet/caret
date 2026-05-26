/**
 * Editor feature utilities.
 * Domain/Infrastructure layer: pure TS functions, framework-agnostic.
 * Examples: document parsers, serializers, content transformers.
 */
export {
  bootstrap_collaboration_document,
  COLLABORATION_FIELD,
  create_document_schema_extensions,
  create_editor_extensions,
  has_bootstrap_content,
  is_collaboration_document_empty,
  replace_collaboration_document_content,
} from "./editorExtensions";

export { convert_ai_content_to_tiptap_json } from "./aiContentConverter";
export { get_document_metrics } from "./documentMetrics";
export type { DocumentMetrics } from "./documentMetrics";
