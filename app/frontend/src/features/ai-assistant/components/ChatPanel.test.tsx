import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ConversationListResponse } from "../api/aiApi";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * Mock the useAiStream hook with a controllable implementation.
 * We use a getter for `messages` so that each render picks up the
 * current value of `mock_messages`, not the value at mock-creation time.
 */
const mock_send_message = vi.fn();
const mock_stop_generating = vi.fn();
const mock_load_messages = vi.fn();
const mock_clear = vi.fn();
const mock_clear_pending_change = vi.fn();

const { mock_list_conversations, mock_touch_conversation } = vi.hoisted(() => ({
  mock_list_conversations: vi.fn(
    async (): Promise<ConversationListResponse> => ({
      items: [],
      total: 0,
    }),
  ),
  mock_touch_conversation: vi.fn().mockResolvedValue(undefined),
}));

let mock_messages: Array<{
  id: string;
  role: "user" | "assistant";
  content: string;
  tool_calls: Array<{
    tool_name: string;
    text_offset: number;
    result_summary?: string | null;
    result?: unknown;
  }>;
  segments?: Array<
    | { type: "text"; content: string }
    | {
        type: "tool_calls";
        tool_calls: Array<{
          tool_name: string;
          text_offset: number;
          result_summary?: string | null;
          result?: unknown;
        }>;
      }
  >;
  is_streaming?: boolean;
}> = [];
let mock_is_loading = false;
let mock_error: string | null = null;
let mock_ai_mode: "ask" | "agent" = "ask";
let mock_selected_agent_type = "general";
let mock_active_conversation_id: string | null = null;

vi.mock("../hooks/useAiStream", () => ({
  useAiStream: () => ({
    get messages() {
      return mock_messages;
    },
    get is_loading() {
      return mock_is_loading;
    },
    get error() {
      return mock_error;
    },
    pending_change: null,
    send_message: mock_send_message,
    stop_generating: mock_stop_generating,
    load_messages: mock_load_messages,
    clear: mock_clear,
    clear_pending_change: mock_clear_pending_change,
  }),
}));

/**
 * Mock the Zustand ai_store.
 */
const mock_close_panel = vi.fn();
const mock_set_conversation = vi.fn();
const mock_set_ai_mode = vi.fn((mode: "ask" | "agent") => {
  mock_ai_mode = mode;
});
const mock_set_selected_agent_type = vi.fn((agent_type: string) => {
  mock_selected_agent_type = agent_type;
});

vi.mock("../../../stores/aiStore", () => ({
  useAiStore: () => ({
    isPanelOpen: true,
    activeConversationId: mock_active_conversation_id,
    aiMode: mock_ai_mode,
    selectedAgentType: mock_selected_agent_type,
    closePanel: mock_close_panel,
    setConversation: mock_set_conversation,
    setAiMode: mock_set_ai_mode,
    setSelectedAgentType: mock_set_selected_agent_type,
  }),
}));

vi.mock("../../../lib/supabase", () => ({
  supabase_client: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US" },
  }),
}));

/**
 * Mock aiApi to avoid real network calls.
 */
vi.mock("../api/aiApi", () => ({
  deleteConversation: vi.fn().mockResolvedValue(undefined),
  createConversation: vi.fn(),
  listMessages: vi.fn(),
  listConversations: mock_list_conversations,
  touchConversation: mock_touch_conversation,
  streamAiResponse: vi.fn(),
}));

// Import after mocking so the component sees the test doubles.
import { ChatPanel } from "./ChatPanel";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChatPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock_messages = [];
    mock_is_loading = false;
    mock_error = null;
    mock_ai_mode = "ask";
    mock_selected_agent_type = "general";
    mock_active_conversation_id = null;
  });

  it("renders the panel title", () => {
    render(<ChatPanel document_id="doc-1" />);
    // The t() mock returns the key, so panel_title is rendered literally.
    expect(screen.getByText("panel_title")).toBeInTheDocument();
  });

  it("renders the message input textarea", () => {
    render(<ChatPanel document_id="doc-1" />);
    const input = screen.getByRole("textbox", { name: "input_placeholder" });
    expect(input).toBeInTheDocument();
  });

  it("shows the close button", () => {
    render(<ChatPanel document_id="doc-1" />);
    const close_btn = screen.getByRole("button", { name: "close_panel" });
    expect(close_btn).toBeInTheDocument();
  });

  it("calls close_panel when the close button is clicked", () => {
    render(<ChatPanel document_id="doc-1" />);
    const close_btn = screen.getByRole("button", { name: "close_panel" });
    fireEvent.click(close_btn);
    expect(mock_close_panel).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state when there are no messages", () => {
    render(<ChatPanel document_id="doc-1" />);
    expect(screen.getByText("empty_state")).toBeInTheDocument();
  });

  it("does not render the empty state when messages exist", () => {
    mock_messages = [{ id: "m1", role: "user", content: "Hello", tool_calls: [] }];
    render(<ChatPanel document_id="doc-1" />);
    expect(screen.queryByText("empty_state")).not.toBeInTheDocument();
  });

  it("renders user and assistant messages", () => {
    mock_messages = [
      { id: "m1", role: "user", content: "My question", tool_calls: [] },
      { id: "m2", role: "assistant", content: "My answer", tool_calls: [] },
    ];
    render(<ChatPanel document_id="doc-1" />);
    expect(screen.getByText("My question")).toBeInTheDocument();
    expect(screen.getByText("My answer")).toBeInTheDocument();
  });

  it("renders assistant markdown content", () => {
    mock_messages = [
      {
        id: "m1",
        role: "assistant",
        content: "**Bold** and [link](https://example.com)",
        tool_calls: [],
      },
    ];

    render(<ChatPanel document_id="doc-1" />);

    expect(screen.getByText("Bold")).toHaveClass("font-semibold");
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });

  it("renders think content in a collapsible block", () => {
    mock_ai_mode = "agent";
    mock_messages = [
      {
        id: "m1",
        role: "assistant",
        content: "<think>Internal note</think>Final answer",
        tool_calls: [],
      },
    ];

    render(<ChatPanel document_id="doc-1" />);

    const details = screen.getByText("thought_briefly").closest("details");
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("Internal note")).toBeInTheDocument();
    expect(screen.getByText("Final answer")).toBeInTheDocument();
  });

  it("sends a message on Enter key", () => {
    render(<ChatPanel document_id="doc-1" />);
    const input = screen.getByRole("textbox", { name: "input_placeholder" });
    fireEvent.change(input, { target: { value: "Test message" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(mock_send_message).toHaveBeenCalledWith("Test message", "doc-1", undefined, undefined);
  });

  it("does not render a model selector", () => {
    render(<ChatPanel document_id="doc-1" />);
    expect(screen.queryByRole("button", { name: "model_selector" })).not.toBeInTheDocument();
  });

  it("shows the active agent type and closes the mode menu after selecting analyst", () => {
    mock_ai_mode = "agent";

    const { rerender } = render(<ChatPanel document_id="doc-1" />);

    expect(screen.getByText("General")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "mode_agent" }));
    fireEvent.click(screen.getByRole("button", { name: /analyst/i }));

    expect(mock_set_selected_agent_type).toHaveBeenCalledWith("analyst");
    expect(screen.queryByText("Agent type")).not.toBeInTheDocument();

    rerender(<ChatPanel document_id="doc-1" />);

    expect(screen.getByText("Analyst")).toBeInTheDocument();
  });

  it("does not send an empty message on Enter", () => {
    render(<ChatPanel document_id="doc-1" />);
    const input = screen.getByRole("textbox", { name: "input_placeholder" });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(mock_send_message).not.toHaveBeenCalled();
  });

  it("does not send on Shift+Enter (allows newlines)", () => {
    render(<ChatPanel document_id="doc-1" />);
    const input = screen.getByRole("textbox", { name: "input_placeholder" });
    fireEvent.change(input, { target: { value: "Line 1" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(mock_send_message).not.toHaveBeenCalled();
  });

  it("shows stop_generating button when loading", () => {
    mock_is_loading = true;
    render(<ChatPanel document_id="doc-1" />);
    const stop_btn = screen.getByRole("button", { name: "stop_generating" });
    expect(stop_btn).toBeInTheDocument();
  });

  it("calls stop_generating when stop button is clicked", () => {
    mock_is_loading = true;
    render(<ChatPanel document_id="doc-1" />);
    const stop_btn = screen.getByRole("button", { name: "stop_generating" });
    fireEvent.click(stop_btn);
    expect(mock_stop_generating).toHaveBeenCalledTimes(1);
  });

  it("renders error banner when error is set", () => {
    mock_error = "Something failed";
    render(<ChatPanel document_id="doc-1" />);
    // The error banner renders the i18n key "error.unavailable"
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("error.unavailable")).toBeInTheDocument();
  });

  it("shows retry button when error occurs and a user message exists", () => {
    mock_error = "Something failed";
    mock_messages = [{ id: "m1", role: "user", content: "Summarize this", tool_calls: [] }];
    render(<ChatPanel document_id="doc-1" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders the aria-live messages region", () => {
    render(<ChatPanel document_id="doc-1" />);
    const log = screen.getByRole("log");
    expect(log).toHaveAttribute("aria-live", "polite");
  });

  it("auto-selects the most recent conversation when none is active", async () => {
    mock_list_conversations.mockResolvedValueOnce({
      items: [
        {
          id: "conv-latest",
          title: "Latest",
          document_id: "doc-1",
          created_at: "",
          updated_at: "",
        },
      ],
      total: 1,
    });

    render(<ChatPanel document_id="doc-1" />);

    await waitFor(() => {
      expect(mock_set_conversation).toHaveBeenCalledWith("conv-latest");
    });
  });

  it("touches and loads the active conversation on open", async () => {
    mock_active_conversation_id = "conv-1";
    mock_list_conversations.mockResolvedValueOnce({
      items: [
        { id: "conv-1", title: "Latest", document_id: "doc-1", created_at: "", updated_at: "" },
      ],
      total: 1,
    });

    render(<ChatPanel document_id="doc-1" />);

    await waitFor(() => {
      expect(mock_touch_conversation).toHaveBeenCalledWith("conv-1");
      expect(mock_load_messages).toHaveBeenCalledWith("conv-1");
    });
  });

  it("does not auto-restore an old conversation after starting a new one", async () => {
    mock_active_conversation_id = "conv-old";
    mock_messages = [{ id: "m1", role: "user", content: "Hello", tool_calls: [] }];

    mock_list_conversations
      .mockResolvedValueOnce({
        items: [
          { id: "conv-old", title: "Old", document_id: "doc-1", created_at: "", updated_at: "" },
        ],
        total: 1,
      })
      .mockResolvedValueOnce({
        items: [
          { id: "conv-old", title: "Old", document_id: "doc-1", created_at: "", updated_at: "" },
        ],
        total: 1,
      });

    const { rerender } = render(<ChatPanel document_id="doc-1" />);

    fireEvent.click(screen.getByRole("button", { name: "new_conversation" }));

    mock_active_conversation_id = null;
    mock_messages = [];
    rerender(<ChatPanel document_id="doc-1" />);

    await waitFor(() => {
      expect(mock_set_conversation).not.toHaveBeenCalledWith("conv-old");
    });
  });

  it("renders an inline assistant tool trace for persisted history", () => {
    mock_ai_mode = "agent";
    mock_messages = [
      {
        id: "m1",
        role: "assistant",
        content: "My answer",
        tool_calls: [
          { tool_name: "get_document_content", text_offset: 0 },
          {
            tool_name: "count_words",
            text_offset: 0,
            result_summary: "4 words",
            result: { value: 4 },
          },
        ],
      },
    ];

    render(<ChatPanel document_id="doc-1" />);

    expect(
      screen.getByText("I read the document and counted the words before answering."),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByText("I read the document and counted the words before answering."),
    );

    expect(screen.getByText("Read document")).toBeInTheDocument();
    expect(screen.getByText("Counted words")).toBeInTheDocument();
    expect(screen.getByText("4 words")).toBeInTheDocument();
  });

  it("renders pending inline tool trace while streaming", () => {
    mock_ai_mode = "agent";
    mock_is_loading = true;
    mock_messages = [
      {
        id: "m1",
        role: "assistant",
        content: "",
        tool_calls: [{ tool_name: "count_words", text_offset: 0 }],
        is_streaming: true,
      },
    ];

    render(<ChatPanel document_id="doc-1" />);

    expect(screen.getByText("Let me count the words first...")).toBeInTheDocument();
    expect(screen.getByText("Counting words...")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("renders streamed tool traces in chronological order with text segments", () => {
    mock_ai_mode = "agent";
    mock_messages = [
      {
        id: "m1",
        role: "assistant",
        content: "Before.\n\nAfter.",
        segments: [
          { type: "text", content: "Before.\n\n" },
          {
            type: "tool_calls",
            tool_calls: [
              {
                tool_name: "count_words",
                text_offset: 8,
                result_summary: "2 words",
                result: { value: 2 },
              },
            ],
          },
          { type: "text", content: "After." },
        ],
        tool_calls: [
          {
            tool_name: "count_words",
            text_offset: 9,
            result_summary: "2 words",
            result: { value: 2 },
          },
        ],
      },
    ];

    render(<ChatPanel document_id="doc-1" />);

    const before = screen.getByText("Before.");
    const trace = screen.getByText("I counted the words before answering.");
    const after = screen.getByText("After.");

    expect(before.compareDocumentPosition(trace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trace.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("falls back to stored offsets for persisted history", () => {
    mock_ai_mode = "agent";
    mock_messages = [
      {
        id: "m1",
        role: "assistant",
        content: "La frase existente sigue igual.",
        tool_calls: [
          {
            tool_name: "propose_document_replacement",
            text_offset: 14,
            result_summary: "edit prepared",
            result: { ok: true },
          },
        ],
      },
    ];

    render(<ChatPanel document_id="doc-1" />);

    expect(screen.getByText("La frase existente")).toBeInTheDocument();
    expect(screen.getByText("sigue igual.")).toBeInTheDocument();
    expect(screen.queryByText(/^exist$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^ente sigue igual\.$/)).not.toBeInTheDocument();
  });
});
