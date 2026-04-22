/**
 * useGhostText hook.
 *
 * Manages the ghost text suggestion lifecycle for the Tiptap editor:
 *   - Ctrl+Space triggers an inline AI completion request.
 *   - Tab accepts the current ghost text suggestion.
 *   - Escape dismisses the current ghost text suggestion.
 *
 * The hook is designed to be used alongside the GhostText Tiptap extension.
 * It delegates streaming to `stream_ai_response` so auth and routing are
 * handled consistently with the rest of the AI assistant feature.
 *
 * @param editor - The Tiptap editor instance (may be null during initial render).
 * @param conversationId - The current AI conversation UUID (may be null if not started).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { streamAiResponse } from "../../ai-assistant/api/aiApi";

/** Options for the useGhostText hook. */
interface UseGhostTextOptions {
  /** Tiptap editor instance. */
  editor: Editor | null;
  /** Current AI conversation UUID (null if no conversation is active). */
  conversationId: string | null;
  /** Workspace UUID for workspace-scoped retrieval. */
  workspaceId?: string | null;
  /** Folder UUID for folder-aware retrieval ranking. */
  folderId?: string | null;
}

/** Return type of the useGhostText hook. */
interface UseGhostTextReturn {
  /** Whether an inline suggestion is currently being fetched. */
  is_loading: boolean;
  /** The current ghost text suggestion text (empty if none). */
  suggestion: string;
  /** Manually trigger a ghost text completion for the cursor position. */
  trigger_suggestion: () => Promise<void>;
  /** Accept the current ghost text suggestion. */
  accept_suggestion: () => void;
  /** Dismiss the current ghost text suggestion. */
  dismiss_suggestion: () => void;
}

/**
 * Reads the current paragraph text around the cursor position.
 *
 * @param editor - The active Tiptap editor instance.
 * @returns The full text content of the paragraph that contains the cursor.
 */
function getCursorContext(editor: Editor): string {
  const { state } = editor;
  const { $head } = state.selection;
  const paragraph_start = $head.start();
  const paragraph_end = $head.end();
  return state.doc.textBetween(paragraph_start, paragraph_end, " ");
}

/**
 * Hook that wires up the GhostText extension to an AI streaming endpoint.
 *
 * Provides keyboard-driven UX for inline AI completions:
 *   - Ctrl+Space: fetch and show a suggestion for the current paragraph
 *   - Tab: accept the suggestion (insert it into the document)
 *   - Escape: discard the suggestion
 *
 * @param options - Configuration options.
 * @returns State and handlers for the ghost text feature.
 */
export function useGhostText({
  editor,
  conversationId,
  workspaceId,
  folderId,
}: UseGhostTextOptions): UseGhostTextReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestion, set_suggestion] = useState("");

  /** Holds the AbortController for the current in-flight stream, if any. */
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Cancel any in-flight request and clear ghost text from the editor.
   */
  const dismiss_suggestion = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    set_suggestion("");
    setIsLoading(false);
    if (editor && !editor.isDestroyed) {
      editor.commands.clearGhostText();
    }
  }, [editor]);

  /**
   * Accept the current suggestion by inserting it at the cursor position.
   * Clears the ghost text decoration afterwards.
   */
  const accept_suggestion = useCallback(() => {
    if (!editor || editor.isDestroyed || !suggestion) return;
    editor.chain().focus().insertContent(suggestion).run();
    set_suggestion("");
    editor.commands.clearGhostText();
  }, [editor, suggestion]);

  /**
   * Stream an inline AI completion for the current paragraph context.
   *
   * Sends the paragraph text to the AI service via `stream_ai_response`
   * (which handles Supabase auth internally) and streams the response back
   * as ghost text. Each incoming SSE delta updates the decoration in real
   * time so the user can preview the suggestion as it grows.
   */
  const trigger_suggestion = useCallback(async () => {
    if (!editor || !conversationId) return;

    dismiss_suggestion();

    const context = getCursorContext(editor);
    if (!context.trim()) return;

    setIsLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const generator = streamAiResponse({
        conversation_id: conversationId,
        workspace_id: workspaceId ?? undefined,
        folder_id: folderId ?? undefined,
        message: `Continue the following text naturally (respond with only the continuation, no preamble): "${context}"`,
        document_context: context,
        signal: controller.signal,
      });

      let accumulated = "";

      for await (const chunk of generator) {
        // Guard: editor may have been destroyed while the stream was in flight.
        if (editor.isDestroyed) break;

        if (chunk.type === "delta" && chunk.content) {
          accumulated += chunk.content;
          editor.commands.setGhostText(accumulated);
          set_suggestion(accumulated);
        } else if (chunk.type === "done") {
          setIsLoading(false);
        } else if (chunk.type === "error") {
          dismiss_suggestion();
          return;
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        dismiss_suggestion();
      }
    } finally {
      setIsLoading(false);
    }
  }, [editor, conversationId, workspaceId, folderId, dismiss_suggestion]);

  /**
   * Register keyboard shortcuts on the editor DOM element.
   *
   * - Ctrl+Space: trigger_suggestion
   * - Tab (when suggestion is active): accept_suggestion
   * - Escape (when suggestion is active): dismiss_suggestion
   *
   * Listeners are cleaned up when the editor unmounts or when
   * the relevant callbacks change.
   *
   * Guards against accessing `editor.view.dom` before the Tiptap view is
   * mounted (e.g. during React state flush after `on_editor_ready`) by
   * checking `editor.isDestroyed` and using optional chaining.
   */
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    // view.dom may be unavailable briefly after the editor instance is created
    // but before Tiptap finishes mounting the ProseMirror view.
    const domEl = editor.view?.dom;
    if (!domEl) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.code === "Space") {
        event.preventDefault();
        trigger_suggestion();
        return;
      }

      if (event.code === "Tab" && suggestion) {
        event.preventDefault();
        accept_suggestion();
        return;
      }

      if (event.code === "Escape" && suggestion) {
        event.preventDefault();
        dismiss_suggestion();
        return;
      }
    };

    domEl.addEventListener("keydown", handleKeyDown);
    return () => domEl.removeEventListener("keydown", handleKeyDown);
  }, [editor, suggestion, trigger_suggestion, accept_suggestion, dismiss_suggestion]);

  return {
    is_loading: isLoading,
    suggestion,
    trigger_suggestion,
    accept_suggestion,
    dismiss_suggestion,
  };
}
