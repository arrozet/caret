import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

const { mock_get_models, mock_list_conversations } = vi.hoisted(() => ({
  mock_get_models: vi.fn(() => new Promise<never>(() => {})),
  mock_list_conversations: vi.fn(() => new Promise<never>(() => {})),
}));

let mock_messages: Array<{
  id: string;
  role: "user" | "assistant";
  content: string;
  is_streaming?: boolean;
}> = [];
let mock_is_loading = false;
let mock_error: string | null = null;
let mock_ai_mode: "ask" | "agent" = "ask";

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
    tool_calls: [],
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

vi.mock("../../../stores/aiStore", () => ({
  useAiStore: () => ({
    isPanelOpen: true,
    activeConversationId: null,
    aiMode: mock_ai_mode,
    selectedAgentType: "general",
    selectedModelId: undefined,
    closePanel: mock_close_panel,
    setConversation: mock_set_conversation,
    setAiMode: vi.fn(),
    setSelectedModelId: vi.fn(),
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
 * getModels is included so the component's useEffect does not throw on mount.
 */
vi.mock("../api/aiApi", () => ({
  deleteConversation: vi.fn().mockResolvedValue(undefined),
  createConversation: vi.fn(),
  listMessages: vi.fn(),
  listConversations: mock_list_conversations,
  streamAiResponse: vi.fn(),
  getModels: mock_get_models,
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
    mock_messages = [{ id: "m1", role: "user", content: "Hello" }];
    render(<ChatPanel document_id="doc-1" />);
    expect(screen.queryByText("empty_state")).not.toBeInTheDocument();
  });

  it("renders user and assistant messages", () => {
    mock_messages = [
      { id: "m1", role: "user", content: "My question" },
      { id: "m2", role: "assistant", content: "My answer" },
    ];
    render(<ChatPanel document_id="doc-1" />);
    expect(screen.getByText("My question")).toBeInTheDocument();
    expect(screen.getByText("My answer")).toBeInTheDocument();
  });

  it("renders assistant markdown content", () => {
    mock_messages = [
      { id: "m1", role: "assistant", content: "**Bold** and [link](https://example.com)" },
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
    expect(mock_send_message).toHaveBeenCalledWith(
      "Test message",
      "doc-1",
      undefined,
      undefined,
      undefined,
    );
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

  it("renders the aria-live messages region", () => {
    render(<ChatPanel document_id="doc-1" />);
    const log = screen.getByRole("log");
    expect(log).toHaveAttribute("aria-live", "polite");
  });
});
