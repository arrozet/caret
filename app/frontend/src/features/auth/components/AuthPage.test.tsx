// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthPage } from "./AuthPage";

const mock_navigate = vi.fn();
const mock_sign_in = vi.fn();
const mock_sign_up = vi.fn();
const mock_sign_in_with_oauth = vi.fn();
const mock_toggle_theme = vi.fn();

const translations: Record<string, string> = {
  app_name: "Caret",
  "auth.sign_in": "Sign In",
  "auth.sign_up": "Sign Up",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.email_placeholder": "you@example.com",
  "auth.password_placeholder": "Enter your password",
  "auth.no_account": "Don't have an account?",
  "auth.has_account": "Already have an account?",
  "auth.signing_in": "Signing in...",
  "auth.signing_up": "Creating account...",
  "auth.continue_with_google": "Continue with Google",
  "auth.or_divider": "or",
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
  useNavigate: () => mock_navigate,
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
      signIn: mock_sign_in,
      signUp: mock_sign_up,
      signInWithOauth: mock_sign_in_with_oauth,
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
  });

  it("renders a Caret-branded editorial sign-in experience", () => {
    render(<AuthPage />);

    expect(screen.getByRole("link", { name: /caret/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Welcome back")).not.toBeInTheDocument();
  });
});
