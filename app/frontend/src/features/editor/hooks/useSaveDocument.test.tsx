// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateDocument } from "../api/documentApi";
import { useSaveDocument } from "./useSaveDocument";

vi.mock("../api/documentApi", () => ({
  updateDocument: vi.fn(),
}));

/** Unit tests for useSaveDocument. Validates autosave failures surface without long retry loops. */
describe("useSaveDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Verifies that autosave does not retry failed PATCH calls because the editor needs quick status feedback. */
  it("does not retry failed autosave mutations", async () => {
    // Arrange
    vi.mocked(updateDocument).mockRejectedValueOnce(new Error("Network failure"));
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSaveDocument("doc-1"), { wrapper });

    // Act
    await expect(
      act(() =>
        result.current.mutateAsync({
          content_text: "Draft",
          content_json: { type: "doc" },
        }),
      ),
    ).rejects.toThrow("Network failure");

    // Assert
    expect(updateDocument).toHaveBeenCalledTimes(1);
  });
});
