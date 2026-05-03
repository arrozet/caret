// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthPage } from "./AuthPage";

const mock_sign_in_with_google = vi.fn();
const mock_toggle_theme = vi.fn();

const translations: Record<string, string> = {
  app_name: "Caret",
  "auth.sign_in": "Sign In",
  "auth.google_only_hint": "Use your Google account to continue to Caret.",
  "auth.continue_with_google": "Continue with Google",
  "auth.surface_label": "Sign in",
  "theme.dark": "Dark",
};

vi.mock("react-router-dom", () => ({
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      translations[key] ?? options?.defaultValue ?? key,
  }),
}));

vi.mock("../../../stores/authStore", () => ({
  useAuthStore: (selector: (state: object) => unknown) =>
    selector({
      signInWithGoogle: mock_sign_in_with_google,
    }),
}));

vi.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "dark",
    toggleTheme: mock_toggle_theme,
  }),
}));

describe("AuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock_sign_in_with_google.mockResolvedValue(null);
  });

  it("renders a Caret-branded Google-only sign-in experience", () => {
    render(<AuthPage />);

    expect(screen.getByRole("link", { name: /caret/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/use your google account to continue/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();
  });

  it("starts the Google OAuth flow from the primary action", async () => {
    render(<AuthPage />);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => {
      expect(mock_sign_in_with_google).toHaveBeenCalledTimes(1);
    });
  });
});
