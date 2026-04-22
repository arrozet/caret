/**
 * useGhostText hook.
 *
 * Manages the ghost text suggestion lifecycle for the Tiptap editor:
 *   - Typing pauses trigger an inline AI completion request.
 *   - Tab accepts the current ghost text suggestion.
 *   - Escape dismisses the current ghost text suggestion.
 *
 * The hook is designed to be used alongside the GhostText Tiptap extension.
 * It delegates text completion to the shared AI completion hook so auth and
 * routing are handled consistently with the rest of the AI assistant feature.
 *
 * @param editor - The Tiptap editor instance (may be null during initial render).
 * @param conversationId - The current AI conversation UUID (may be null if not started).
 */

import { useCallback, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { useCompletion } from "../../ai-assistant/hooks";

/** Options for the useGhostText hook. */
interface UseGhostTextOptions {
  /** Tiptap editor instance. */
  editor: Editor | null;
  /** Current AI conversation UUID (null if no conversation is active). */
  conversationId: string | null;
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
 * Hook that wires up the GhostText extension to the AI completion endpoint.
 *
 * Provides keyboard-driven UX for inline AI completions:
 *   - Typing pauses: fetch and show a suggestion for the current paragraph
 *   - Tab: accept the suggestion (insert it into the document)
 *   - Escape: discard the suggestion
 *
 * @param options - Configuration options.
 * @returns State and handlers for the ghost text feature.
 */
export function useGhostText({ editor, conversationId }: UseGhostTextOptions): UseGhostTextReturn {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    is_loading: isLoading,
    suggestion: completionSuggestion,
    request_completion,
    accept_suggestion: accept_completion,
    dismiss_suggestion: dismiss_completion,
  } = useCompletion();

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (completionSuggestion) {
      editor.commands.setGhostText(completionSuggestion);
    } else {
      editor.commands.clearGhostText();
    }
  }, [editor, completionSuggestion]);

  /** Cancel any in-flight request and clear ghost text from the editor. */
  const dismiss_suggestion = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (editor && !editor.isDestroyed) {
      editor.commands.clearGhostText();
    }
    dismiss_completion();
  }, [editor, dismiss_completion]);

  /** Accept the current suggestion by inserting it at the cursor position. */
  const accept_suggestion = useCallback(() => {
    if (!editor || editor.isDestroyed || !completionSuggestion) return;
    editor.chain().focus().insertContent(completionSuggestion).run();
    accept_completion();
    editor.commands.clearGhostText();
  }, [editor, completionSuggestion, accept_completion]);

  const trigger_suggestion = useCallback(async () => {
    if (!editor || !conversationId) return;

    dismiss_suggestion();

    const context = getCursorContext(editor);
    if (!context.trim()) return;

    try {
      await request_completion(
        `Continue the following text naturally. Return only the continuation, with no preamble: "${context}"`,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        dismiss_suggestion();
      }
    }
  }, [editor, conversationId, dismiss_suggestion, request_completion]);

  /**
   * Register keyboard shortcuts on the editor DOM element.
   *
   * - Typing pauses: trigger_suggestion
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
      if (event.code === "Tab" && completionSuggestion) {
        event.preventDefault();
        accept_suggestion();
        return;
      }

      if (event.code === "Escape" && completionSuggestion) {
        event.preventDefault();
        dismiss_suggestion();
        return;
      }
    };

    domEl.addEventListener("keydown", handleKeyDown);
    return () => domEl.removeEventListener("keydown", handleKeyDown);
  }, [editor, completionSuggestion, accept_suggestion, dismiss_suggestion]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !conversationId) return;

    const schedule_completion = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void trigger_suggestion();
      }, 350);
    };

    const domEl = editor.view?.dom;
    if (!domEl) return;

    const handleInput = () => {
      schedule_completion();
    };

    domEl.addEventListener("input", handleInput);
    return () => {
      domEl.removeEventListener("input", handleInput);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editor, conversationId, trigger_suggestion]);

  return {
    is_loading: isLoading,
    suggestion: completionSuggestion,
    trigger_suggestion,
    accept_suggestion,
    dismiss_suggestion,
  };
}
