// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopBar } from "./TopBar";

const mock_navigate = vi.fn();
const mock_sign_out = vi.fn();
const mock_toggle_theme = vi.fn();
const mock_location = { pathname: "/documents", state: null as null | Record<string, unknown> };
const mock_link = vi.fn();
let current_document: {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  title: string;
} | null = null;

type MockTopBarUser = {
  id: string;
  email: string;
  user_metadata: {
    full_name?: string;
    avatar_url?: string;
  };
};

const mock_user: MockTopBarUser = {
  id: "user-1",
  email: "rozuben@gmail.com",
  user_metadata: {
    full_name: "Ruben Oliva",
    avatar_url: "https://example.com/avatar.png",
  },
};

let current_user: MockTopBarUser = mock_user;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => mock_location,
  useNavigate: () => mock_navigate,
  useParams: () => ({}),
  Link: ({
    children,
    to,
    state,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; state?: unknown }) => {
    mock_link(to, state);
    return (
      <a href={to} data-state={state ? JSON.stringify(state) : undefined} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("../../stores/authStore", () => ({
  useAuthStore: (selector: (state: object) => unknown) =>
    selector({
      user: current_user,
      signOut: mock_sign_out,
    }),
}));

vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "dark",
    toggleTheme: mock_toggle_theme,
  }),
}));

vi.mock("../../features/editor/hooks/useDocument", () => ({
  useDocument: () => ({ data: current_document }),
}));

vi.mock("../../features/editor/hooks/useWorkspaces", () => ({
  useWorkspaces: () => ({ data: [] }),
}));

vi.mock("../../features/editor/hooks/useFolders", () => ({
  useFolders: () => ({ data: [] }),
}));

describe("TopBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    current_user = mock_user;
    current_document = null;
    mock_location.pathname = "/documents";
    mock_location.state = null;
  });

  it("shows only an avatar entry point for account controls", () => {
    render(<TopBar />);

    expect(screen.queryByText("rozuben@gmail.com")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^settings$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open account settings/i })).toBeInTheDocument();
  });

  it("renders the avatar as a settings link", () => {
    render(<TopBar />);

    expect(screen.getByRole("link", { name: /open account settings/i })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(mock_navigate).not.toHaveBeenCalled();
  });

  it("does not expose the email when the user has no profile name", () => {
    current_user = {
      ...mock_user,
      user_metadata: {
        avatar_url: "https://example.com/avatar.png",
      },
    };

    render(<TopBar />);

    expect(screen.queryByLabelText(/avatar for rozuben@gmail\.com/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/avatar for user/i)).toBeInTheDocument();
  });

  it("shows a top-left icon-only back action on the settings route", () => {
    mock_location.pathname = "/settings";
    mock_location.state = {
      return_to: { pathname: "/documents/abc", state: { workspace_id: "ws-1" } },
    };

    render(<TopBar />);

    expect(screen.getByRole("link", { name: /go back/i })).toBeInTheDocument();
    expect(screen.queryByText(/^back$/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go back/i })).toHaveAttribute(
      "href",
      "/documents/abc",
    );
  });

  it("passes the current route as return context when opening settings", () => {
    mock_location.pathname = "/documents/abc";
    mock_location.state = { workspace_id: "ws-1", folder_id: "folder-1" };

    render(<TopBar />);

    const settingsLink = screen.getByRole("link", { name: /open account settings/i });

    expect(settingsLink).toHaveAttribute("href", "/settings");
    expect(settingsLink).toHaveAttribute(
      "data-state",
      JSON.stringify({
        return_to: {
          pathname: "/documents/abc",
          state: { workspace_id: "ws-1", folder_id: "folder-1" },
        },
      }),
    );
  });

  it("preserves the original return target while already on settings", () => {
    mock_location.pathname = "/settings";
    mock_location.state = {
      return_to: { pathname: "/documents/abc", state: { workspace_id: "ws-1" } },
    };

    render(<TopBar />);

    expect(screen.getByRole("link", { name: /open account settings/i })).toHaveAttribute(
      "data-state",
      JSON.stringify({
        return_to: { pathname: "/documents/abc", state: { workspace_id: "ws-1" } },
      }),
    );
  });

  it("shows the same top-left back link on document routes", () => {
    mock_location.pathname = "/documents/abc";
    current_document = {
      id: "abc",
      workspace_id: "ws-1",
      folder_id: "folder-1",
      title: "Draft",
    };

    render(<TopBar />);

    expect(screen.getByRole("link", { name: /go back/i })).toHaveAttribute("href", "/documents");
    expect(screen.getByRole("link", { name: /go back/i })).toHaveAttribute(
      "data-state",
      JSON.stringify({ workspace_id: "ws-1", folder_id: "folder-1" }),
    );
  });
});
