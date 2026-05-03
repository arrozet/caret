import { beforeEach, describe, expect, it, vi } from "vitest";

const mock_sign_in_with_oauth = vi.fn();
const mock_get_session = vi.fn();
const mock_on_auth_state_change = vi.fn();
const mock_sign_out = vi.fn();

vi.mock("../lib/supabase", () => ({
  supabase_client: {
    auth: {
      getSession: mock_get_session,
      onAuthStateChange: mock_on_auth_state_change,
      signInWithOAuth: mock_sign_in_with_oauth,
      signOut: mock_sign_out,
    },
  },
}));

describe("authStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mock_get_session.mockResolvedValue({ data: { session: null } });
    mock_on_auth_state_change.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mock_sign_in_with_oauth.mockResolvedValue({ error: null });
    mock_sign_out.mockResolvedValue({ error: null });

    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("https://caret.test/login"),
    });
  });

  it("redirects Google OAuth users to the documents dashboard", async () => {
    const { useAuthStore } = await import("./authStore");

    await useAuthStore.getState().signInWithGoogle();

    expect(mock_sign_in_with_oauth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://caret.test/documents",
      },
    });
  });
});
