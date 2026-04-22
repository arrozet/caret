import { useCallback, useEffect, useRef, useState } from "react";

/** Controller for a text completion request. */
interface CompletionRequestController {
  abortController: AbortController;
  requestId: number;
}

/** Return value for the inline completion hook. */
interface UseCompletionReturn {
  is_loading: boolean;
  suggestion: string;
  request_completion: (prompt: string, modelId?: string) => Promise<void>;
  accept_suggestion: () => void;
  dismiss_suggestion: () => void;
}

/**
 * Shared inline completion hook used by the editor and AI chat composer.
 *
 * It lazily imports the AI API client so the hook can be tested without
 * immediately pulling in Supabase configuration.
 */
export function useCompletion(
  onSuggestionAccepted?: (suggestion: string) => void,
): UseCompletionReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const controllerRef = useRef<CompletionRequestController | null>(null);
  const requestCounterRef = useRef(0);

  const dismiss_suggestion = useCallback(() => {
    controllerRef.current?.abortController.abort();
    controllerRef.current = null;
    setSuggestion("");
    setIsLoading(false);
  }, []);

  const accept_suggestion = useCallback(() => {
    if (!suggestion) return;
    onSuggestionAccepted?.(suggestion);
    setSuggestion("");
  }, [onSuggestionAccepted, suggestion]);

  const request_completion = useCallback(
    async (prompt: string, modelId?: string) => {
      if (!prompt.trim()) {
        dismiss_suggestion();
        return;
      }

      controllerRef.current?.abortController.abort();
      const requestId = requestCounterRef.current + 1;
      requestCounterRef.current = requestId;
      const abortController = new AbortController();
      controllerRef.current = { abortController, requestId };
      setIsLoading(true);

      try {
        const { completeText } = await import("../api/aiApi");
        const response = await completeText(prompt, modelId, abortController.signal);

        if (controllerRef.current?.requestId !== requestId) return;
        setSuggestion(response.completion);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestion("");
        }
      } finally {
        if (controllerRef.current?.requestId === requestId) {
          controllerRef.current = null;
          setIsLoading(false);
        }
      }
    },
    [dismiss_suggestion],
  );

  useEffect(() => {
    return () => {
      controllerRef.current?.abortController.abort();
    };
  }, []);

  return {
    is_loading: isLoading,
    suggestion,
    request_completion,
    accept_suggestion,
    dismiss_suggestion,
  };
}

/** Test-only escape hatch so the hook can be exercised without network calls. */
export const __internal__ = {
  createCompletionRequestController: (): CompletionRequestController => ({
    abortController: new AbortController(),
    requestId: 0,
  }),
};
