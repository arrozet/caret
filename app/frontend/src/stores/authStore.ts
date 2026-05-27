import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase_client } from "../lib/supabase";

/** Possible states for the authentication lifecycle. */
type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/** Public profile stored in user_profiles table (not auth.users metadata). */
interface UserProfile {
  display_name: string | null;
  avatar_url: string | null;
}

/** Shape of the auth store managed by Zustand. */
interface AuthState {
  /** Current Supabase session (null when signed out). */
  session: Session | null;
  /** Convenience accessor for the current user object. */
  user: User | null;
  /** Lifecycle status — drives route guards and loading screens. */
  status: AuthStatus;
  /** Public profile from user_profiles table — persists across OAuth re-login. */
  profile: UserProfile | null;

  /** Initialize the store by reading the current Supabase session. */
  initialize: () => Promise<void>;
  /** Sign in with Google OAuth. Returns an error message on failure. */
  signInWithGoogle: () => Promise<string | null>;
  /** Sign out the current user. */
  signOut: () => Promise<void>;
  /** Update profile in user_profiles table. Returns error message on failure. */
  updateProfile: (data: { full_name?: string; avatar_url?: string }) => Promise<string | null>;
}

/**
 * Fetch or initialize the user profile from user_profiles table.
 * On first access, seeds the row with Google metadata defaults
 * so subsequent Google logins do not overwrite edits.
 */
async function fetchUserProfile(user: User): Promise<UserProfile | null> {
  const { data: existing, error: fetchError } = await supabase_client
    .from("user_profiles")
    .select("display_name, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to fetch user_profiles:", fetchError.message);
    return getProfileFallback(user);
  }

  if (existing) {
    return {
      display_name: existing.display_name,
      avatar_url: existing.avatar_url,
    };
  }

  const defaults: UserProfile = {
    display_name:
      typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
    avatar_url:
      typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null,
  };

  const { error: upsertError } = await supabase_client.from("user_profiles").upsert({
    user_id: user.id,
    display_name: defaults.display_name,
    avatar_url: defaults.avatar_url,
  });

  if (upsertError) {
    console.error("Failed to seed user_profiles row:", upsertError.message);
  }

  return defaults;
}

function getProfileFallback(user: User): UserProfile {
  const meta = user.user_metadata ?? {};
  return {
    display_name: typeof meta.full_name === "string" ? meta.full_name : null,
    avatar_url: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
  };
}

/**
 * Global authentication store.
 *
 * Wraps Supabase Auth and exposes reactive state for the rest of the app.
 * Profile data lives in user_profiles table (not auth.users metadata)
 * so customizations survive Google OAuth re-login.
 */
export const useAuthStore = create<AuthState>()((set, get) => ({
  session: null,
  user: null,
  status: "loading",
  profile: null,

  async initialize() {
    const {
      data: { session },
    } = await supabase_client.auth.getSession();

    const user = session?.user ?? null;

    if (user) {
      const profile = await fetchUserProfile(user);
      set({ session, user, profile, status: "authenticated" });
    } else {
      set({ session, user, profile: null, status: "unauthenticated" });
    }

    supabase_client.auth.onAuthStateChange(async (_event, session) => {
      const newUser = session?.user ?? null;
      if (newUser) {
        const profile = await fetchUserProfile(newUser);
        set({ session, user: newUser, profile, status: "authenticated" });
      } else {
        set({ session: null, user: null, profile: null, status: "unauthenticated" });
      }
    });
  },

  async signInWithGoogle(): Promise<string | null> {
    const { error } = await supabase_client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/documents`,
      },
    });
    return error?.message ?? null;
  },

  async signOut() {
    await supabase_client.auth.signOut();
    set({ session: null, user: null, profile: null, status: "unauthenticated" });
  },

  async updateProfile(data): Promise<string | null> {
    const userId = get().user?.id;
    if (!userId) return "User not authenticated.";

    const { error } = await supabase_client.from("user_profiles").upsert({
      user_id: userId,
      display_name: data.full_name ?? null,
      avatar_url: data.avatar_url ?? null,
      updated_at: new Date().toISOString(),
    });

    if (error) return error.message;

    const profile: UserProfile = {
      display_name: data.full_name ?? null,
      avatar_url: data.avatar_url ?? null,
    };
    set({ profile });
    return null;
  },
}));
