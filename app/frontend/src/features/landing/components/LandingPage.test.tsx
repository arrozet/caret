// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LandingPage } from "./LandingPage";

const mock_navigate = vi.fn();
const mock_toggle_theme = vi.fn();
let mock_auth_status = "unauthenticated";

vi.mock("react-router-dom", () => ({
  useNavigate: () => mock_navigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      if (key === "auth.continue_with_google") return "Continue with Google";
      return options?.defaultValue ?? key;
    },
  }),
}));

vi.mock("../../../stores/authStore", () => ({
  useAuthStore: (selector: (state: object) => unknown) =>
    selector({
      status: mock_auth_status,
    }),
}));

vi.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "dark",
    toggleTheme: mock_toggle_theme,
  }),
}));

vi.mock("./AnimatedMockup", () => ({
  AnimatedMockup: () => <div data-testid="animated-mockup" />,
}));

describe("LandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock_auth_status = "unauthenticated";
    vi.stubGlobal(
      "IntersectionObserver",
      class IntersectionObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it("keeps the landing page visible behind an auth modal on login", () => {
    render(<LandingPage show_auth_modal />);

    expect(screen.getByText(/ready to write\?/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("does not show the auth modal on the default landing page", () => {
    render(<LandingPage />);

    expect(screen.queryByRole("dialog", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("uses the header action for account access", () => {
    render(<LandingPage />);

    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(mock_navigate).toHaveBeenCalledWith("/login");
  });
});
