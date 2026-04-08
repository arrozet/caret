import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase_client } from "../lib/supabase";

/** Possible states for the authentication lifecycle. */
type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/** Shape of the auth store managed by Zustand. */
interface AuthState {
  /** Current Supabase session (null when signed out). */
  session: Session | null;
  /** Convenience accessor for the current user object. */
  user: User | null;
  /** Lifecycle status — drives route guards and loading screens. */
  status: AuthStatus;

  /** Initialize the store by reading the current Supabase session. */
  initialize: () => Promise<void>;
  /** Sign in with email and password. Returns an error message on failure. */
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Create a new account with email and password. Returns an error message on failure. */
  signUp: (email: string, password: string) => Promise<string | null>;
  /** Sign in with a third-party OAuth provider (e.g. Google). Returns an error message on failure. */
  signInWithOauth: (provider: "google" | "github") => Promise<string | null>;
  /** Sign out the current user. */
  signOut: () => Promise<void>;
}

/**
 * Global authentication store.
 *
 * Wraps Supabase Auth and exposes reactive state for the rest of the app.
 * Consumed by route guards, the TopBar user menu, and any component
 * that needs to know whether a user is signed in.
 *
 * State management strategy (FRONTEND.md §21):
 *   Global UI state -> Zustand
 */
export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  status: "loading",

  async initialize() {
    /**
     * Read the persisted session from localStorage (Supabase does this
     * internally). Then subscribe to future auth state changes so the
     * store stays in sync when tokens refresh or the user signs out
     * in another tab.
     */
    const {
      data: { session },
    } = await supabase_client.auth.getSession();

    set({
      session,
      user: session?.user ?? null,
      status: session ? "authenticated" : "unauthenticated",
    });

    supabase_client.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ?? null,
        status: session ? "authenticated" : "unauthenticated",
      });
    });
  },

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase_client.auth.signInWithPassword({
      email,
      password,
    });
    return error?.message ?? null;
  },

  async signUp(email: string, password: string): Promise<string | null> {
    const { error } = await supabase_client.auth.signUp({ email, password });
    return error?.message ?? null;
  },

  async signInWithOauth(provider: "google" | "github"): Promise<string | null> {
    const { error } = await supabase_client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
    return error?.message ?? null;
  },

  async signOut() {
    await supabase_client.auth.signOut();
    set({ session: null, user: null, status: "unauthenticated" });
  },
}));
