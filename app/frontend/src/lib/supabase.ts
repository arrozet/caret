import { createClient } from "@supabase/supabase-js";

/**
 * Environment variables exposed by Vite at build time.
 * Prefixed with VITE_ so they are available in the browser bundle.
 */
const supabase_url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabase_anon_key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const is_test_environment = typeof process !== "undefined" && process.env.NODE_ENV === "test";

if (!supabase_url || !supabase_anon_key) {
  if (!is_test_environment) {
    throw new Error(
      "Missing Supabase environment variables. " +
        "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.",
    );
  }
}

/**
 * Singleton Supabase client for the frontend application.
 *
 * Used for:
 * - Authentication (sign in, sign up, sign out, session management)
 * - Direct Supabase Realtime subscriptions (future)
 *
 * All other data fetching goes through the API Gateway.
 */
export const supabase_client = createClient(
  supabase_url ?? "http://127.0.0.1",
  supabase_anon_key ?? "test",
  {
    auth: {
      /* Persist session in localStorage (default behavior) */
      persistSession: true,
      /* Automatically refresh the token before it expires */
      autoRefreshToken: true,
      /* Detect session from URL hash (for OAuth redirects) */
      detectSessionInUrl: true,
    },
  },
);
