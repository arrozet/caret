import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import type { JSONContent, Editor } from "@tiptap/react";
import type { DocumentChangePayload } from "../../ai-assistant/api/ai_api";
import { EditorPage } from "./EditorPage";

const mock_navigate = vi.fn();
const mock_toggle_panel = vi.fn();
const mock_set_pending_document_change = vi.fn((change: DocumentChangePayload | null) => {
  current_pending_change = change;
});
const mock_add_tab = vi.fn();
const mock_update_tab_title = vi.fn();
const mock_index_document_embeddings = vi.fn();
const mock_mutate_async = vi.fn();

const initial_json: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Texto original" }],
    },
  ],
};

let current_pending_change: DocumentChangePayload | null = null;
let current_text = "Texto original";
let current_html = "<p>Texto original</p>";
let current_json: JSONContent = initial_json;
let set_content_call_count = 0;

const mock_commands_set_content = vi.fn((next_content: JSONContent): boolean => {
  set_content_call_count += 1;

  // First call is the preview-apply attempt (simulate a failure/no-op).
  if (set_content_call_count === 1) {
    return false;
  }

  // Second call is the Accept-path force-apply.
  current_json = next_content;
  current_text = "Hola.";
  current_html = "<p>Hola.</p>";
  return true;
});

const fake_editor = {
  isDestroyed: false,
  commands: {
    setContent: mock_commands_set_content,
  },
  getJSON: vi.fn(() => current_json),
  getText: vi.fn(() => current_text),
  getHTML: vi.fn(() => current_html),
} as unknown as Editor;

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "doc-1" }),
  useNavigate: () => mock_navigate,
}));

vi.mock("../hooks/use_document", () => ({
  use_document: () => ({
    data: {
      id: "doc-1",
      workspace_id: "ws-1",
      folder_id: null,
      title: "Doc test",
      status: "active",
      visibility: "private",
      owner_user_id: "user-1",
      content_json: initial_json,
      content_text: "Texto original",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../hooks/use_save_document", () => ({
  use_save_document: () => ({
    mutateAsync: mock_mutate_async,
  }),
}));

vi.mock("../../../hooks/use_focus_mode", () => ({
  use_focus_mode: vi.fn(),
}));

vi.mock("../../../stores/tabs_store", () => ({
  use_tabs_store: () => ({
    add_tab: mock_add_tab,
    update_tab_title: mock_update_tab_title,
  }),
}));

vi.mock("../../../stores", () => {
  const store = () => ({
    is_panel_open: false,
    toggle_panel: mock_toggle_panel,
    active_conversation_id: null,
    pending_document_change: current_pending_change,
    set_pending_document_change: mock_set_pending_document_change,
  });
  store.getState = () => ({
    pending_document_change: current_pending_change,
  });
  return { use_ai_store: store };
});

vi.mock("../hooks/use_ghost_text", () => ({
  useGhostText: vi.fn(),
}));

vi.mock("../../ai-assistant/api/ai_api", () => ({
  index_document_embeddings: (...args: unknown[]) => mock_index_document_embeddings(...args),
}));

vi.mock("./CaretEditor", () => ({
  CaretEditor: ({ on_editor_ready }: { on_editor_ready?: (editor: Editor) => void }) => {
    useEffect(() => {
      on_editor_ready?.(fake_editor);
    }, [on_editor_ready]);

    return <div data-testid="mock-caret-editor" />;
  },
}));

describe("EditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    current_pending_change = {
      operation: "replace_full",
      original_text: "Texto original",
      proposed_text: "Hola.",
    };

    current_text = "Texto original";
    current_html = "<p>Texto original</p>";
    current_json = initial_json;
    set_content_call_count = 0;

    mock_mutate_async.mockResolvedValue({
      id: "doc-1",
      workspace_id: "ws-1",
      folder_id: null,
      title: "Doc test",
      status: "active",
      visibility: "private",
      owner_user_id: "user-1",
      content_json: current_json,
      content_text: current_text,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("accept applies and persists proposed text even when initial preview setContent fails", async () => {
    // Arrange
    render(<EditorPage />);

    await waitFor(() => {
      expect(mock_commands_set_content).toHaveBeenCalled();
    });

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    // Assert
    await waitFor(
      () => {
        expect(mock_mutate_async).toHaveBeenCalled();
      },
      { timeout: 1_600 },
    );

    const last_call = mock_mutate_async.mock.calls.at(-1)?.[0] as
      | { content_text?: string }
      | undefined;
    expect(last_call?.content_text).toBe("Hola.");
  });
});
