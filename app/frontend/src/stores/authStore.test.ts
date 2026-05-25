import { beforeEach, describe, expect, it, vi } from "vitest";

const mock_sign_in_with_oauth = vi.fn();
const mock_get_session = vi.fn();
const mock_on_auth_state_change = vi.fn();
const mock_sign_out = vi.fn();

const mock_select = vi.fn().mockReturnThis();
const mock_eq = vi.fn().mockReturnThis();
const mock_maybe_single = vi.fn();
const mock_upsert = vi.fn();
const mock_from = vi.fn().mockReturnValue({
  select: mock_select,
  eq: mock_eq,
  maybeSingle: mock_maybe_single,
  upsert: mock_upsert,
});

vi.mock("../lib/supabase", () => ({
  supabase_client: {
    auth: {
      getSession: mock_get_session,
      onAuthStateChange: mock_on_auth_state_change,
      signInWithOAuth: mock_sign_in_with_oauth,
      signOut: mock_sign_out,
    },
    from: mock_from,
  },
}));

describe("authStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mock_from.mockReturnValue({
      select: mock_select,
      eq: mock_eq,
      maybeSingle: mock_maybe_single,
      upsert: mock_upsert,
    });
    mock_select.mockReturnThis();
    mock_eq.mockReturnThis();

    mock_get_session.mockResolvedValue({ data: { session: null } });
    mock_on_auth_state_change.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mock_sign_in_with_oauth.mockResolvedValue({ error: null });
    mock_sign_out.mockResolvedValue({ error: null });
    mock_maybe_single.mockResolvedValue({ data: null, error: null });
    mock_upsert.mockResolvedValue({ error: null });

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

  it("updates user profile via user_profiles table", async () => {
    const mockUser = { id: "user-1", user_metadata: { full_name: "Test", avatar_url: null } };
    mock_get_session.mockResolvedValue({ data: { session: { user: mockUser } } });
    mock_maybe_single.mockResolvedValue({
      data: { display_name: "Test", avatar_url: null },
      error: null,
    });

    const { useAuthStore } = await import("./authStore");
    await useAuthStore.getState().initialize();

    const result = await useAuthStore.getState().updateProfile({
      full_name: "New Name",
      avatar_url: "https://example.com/new-avatar.png",
    });

    expect(result).toBeNull();
    const upsertCalls = mock_upsert.mock.calls;
    const profileCall = upsertCalls[upsertCalls.length - 1];
    expect(profileCall[0]).toMatchObject({
      user_id: "user-1",
      display_name: "New Name",
      avatar_url: "https://example.com/new-avatar.png",
    });
  });

  it("returns error when updateProfile fails", async () => {
    const mockUser = { id: "user-1", user_metadata: { full_name: "Test", avatar_url: null } };
    mock_get_session.mockResolvedValue({ data: { session: { user: mockUser } } });
    mock_maybe_single.mockResolvedValue({
      data: { display_name: "Test", avatar_url: null },
      error: null,
    });

    const { useAuthStore } = await import("./authStore");
    await useAuthStore.getState().initialize();

    mock_upsert.mockResolvedValue({ error: { message: "Database error" } });

    const result = await useAuthStore.getState().updateProfile({
      full_name: "New Name",
    });

    expect(result).toBe("Database error");
  });

  it("seeds user_profiles row on initialize when no profile exists", async () => {
    const mockUser = {
      id: "user-1",
      user_metadata: { full_name: "Google Name", avatar_url: "https://google.com/avatar.png" },
    };
    mock_get_session.mockResolvedValue({ data: { session: { user: mockUser } } });
    mock_maybe_single.mockResolvedValue({ data: null, error: null });

    const { useAuthStore } = await import("./authStore");
    await useAuthStore.getState().initialize();

    expect(mock_upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        display_name: "Google Name",
        avatar_url: "https://google.com/avatar.png",
      }),
    );
  });
});
