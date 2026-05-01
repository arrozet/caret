// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";

const mock_navigate = vi.fn();
const mock_sign_out = vi.fn();
const mock_set_theme = vi.fn();
const mock_change_language = vi.fn();

const mock_user = {
  id: "user-1",
  email: "rozuben@gmail.com",
  app_metadata: { provider: "google" },
  user_metadata: {
    full_name: "Ruben Oliva",
    avatar_url: "https://example.com/avatar.png",
  },
};

vi.mock("react-router-dom", () => ({
  useNavigate: () => mock_navigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      if (key === "auth.sign_out") return "Sign out";
      return options?.defaultValue ?? key;
    },
    i18n: {
      language: "es",
      changeLanguage: mock_change_language,
    },
  }),
}));

vi.mock("../../../stores/authStore", () => ({
  useAuthStore: (selector: (state: object) => unknown) =>
    selector({
      user: mock_user,
      signOut: mock_sign_out,
    }),
}));

vi.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: mock_set_theme,
  }),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock_sign_out.mockResolvedValue(undefined);
  });

  it("hides raw account details and summarizes the login provider", () => {
    render(<SettingsPage />);

    expect(screen.queryByText("rozuben@gmail.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/account id/i)).not.toBeInTheDocument();
    expect(screen.getByText(/logged in with google/i)).toBeInTheDocument();
    expect(screen.queryByText(/^back$/i)).not.toBeInTheDocument();
  });

  it("uses a language dropdown instead of multiple language buttons", () => {
    render(<SettingsPage />);

    expect(screen.getByRole("button", { name: /language/i })).toBeInTheDocument();
    expect(screen.queryByText(/^EN$/i)).not.toBeInTheDocument();
  });

  it("uses an appearance dropdown instead of segmented theme buttons", () => {
    render(<SettingsPage />);

    expect(screen.getByRole("button", { name: /appearance/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^light$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^dark$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^system$/i })).not.toBeInTheDocument();
  });

  it("changes the theme from the appearance dropdown", () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /appearance/i }));
    fireEvent.click(screen.getByRole("option", { name: /^system$/i }));

    expect(mock_set_theme).toHaveBeenCalledWith("system");
  });

  it("shows theme icons inside the appearance menu options", () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /appearance/i }));

    expect(screen.getByTestId("theme-light")).toBeInTheDocument();
    expect(screen.getAllByTestId("theme-dark")).not.toHaveLength(0);
    expect(screen.getByTestId("theme-system")).toBeInTheDocument();
  });

  it("changes the language from the dropdown", () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /language/i }));
    fireEvent.click(screen.getByRole("option", { name: /deutsch/i }));

    expect(mock_change_language).toHaveBeenCalledWith("de");
  });

  it("shows flag visuals inside the language menu options", () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /language/i }));

    expect(screen.getByTestId("flag-us")).toBeInTheDocument();
    expect(screen.getByTestId("flag-de")).toBeInTheDocument();
  });

  it("removes the long sign-out explanation text", () => {
    render(<SettingsPage />);

    expect(screen.queryByText(/signing out removes your session/i)).not.toBeInTheDocument();
  });

  it("keeps sign out as a standalone button below the settings panel", () => {
    render(<SettingsPage />);

    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^session$/i })).not.toBeInTheDocument();
  });

  it("signs out from the centralized settings action", async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(mock_sign_out).toHaveBeenCalledTimes(1);
      expect(mock_navigate).toHaveBeenCalledWith("/login");
    });
  });
});
