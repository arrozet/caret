import { createClient } from "@supabase/supabase-js";
import { runtime_config } from "./runtimeConfig";

const is_test_environment = import.meta.env.MODE === "test" || import.meta.env.VITEST === true;

if (!runtime_config.supabase_url || !runtime_config.supabase_anon_key) {
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
  runtime_config.supabase_url ?? "http://127.0.0.1",
  runtime_config.supabase_anon_key ?? "test",
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
