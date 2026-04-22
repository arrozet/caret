import { Check, Sparkles } from "lucide-react";
import type { DocumentChangePayload } from "../../ai-assistant/api/aiApi";
import { CaretEditor } from "./CaretEditor";
import { build_suggestion_preview_content } from "../utils/suggestionPreview";

interface DocumentSuggestionPreviewProps {
  pending_change: DocumentChangePayload;
  on_accept: () => void;
  on_reject: () => void;
  is_accepting?: boolean;
}

/**
 * Full-canvas suggestion review surface.
 * Renders the proposed edit as a read-only Tiptap document with inline marks.
 */
export function DocumentSuggestionPreview({
  pending_change,
  on_accept,
  on_reject,
  is_accepting = false,
}: DocumentSuggestionPreviewProps) {
  const preview_content = build_suggestion_preview_content(
    pending_change.original_text ?? "",
    pending_change.proposed_text,
  );

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-app/95 backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-surface px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent-ai" />
          <div className="min-w-0">
            <p className="truncate text-ui-sm font-medium text-accent-ai">AI proposed changes</p>
            <p className="text-[11px] text-text-secondary">Inline review mode</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={on_reject}
            disabled={is_accepting}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-ui-xs font-medium text-text-secondary transition-colors hover:bg-app"
          >
            Reject
          </button>
          <button
            onClick={on_accept}
            disabled={is_accepting}
            className="flex items-center gap-1.5 rounded-md bg-accent-ai px-3 py-1.5 text-ui-xs font-medium text-white transition-colors hover:bg-accent-ai/90"
          >
            <Check className="h-3 w-3" />
            {is_accepting ? "Applying..." : "Accept"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-app">
        <CaretEditor
          key={`${pending_change.original_text ?? ""}::${pending_change.proposed_text}`}
          content={preview_content}
          editable={false}
        />
      </div>
    </div>
  );
}
