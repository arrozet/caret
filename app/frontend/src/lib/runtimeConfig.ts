/** Frontend runtime configuration resolved from Vite build-time variables. */
export interface RuntimeConfig {
  /** Public origin where the frontend is served. */
  app_origin: string;
  /** API Gateway base URL, including the `/api/v1` prefix. */
  api_base_url: string;
  /** Collaboration websocket base URL, including the `/document` path. */
  collaboration_ws_url: string;
  /** Whether collaborative editing should be enabled. */
  collaboration_enabled: boolean;
  /** Supabase project URL used by the browser client. */
  supabase_url?: string;
  /** Supabase anonymous publishable key used by the browser client. */
  supabase_anon_key?: string;
}

function trim_trailing_slash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function read_env(name: keyof ImportMetaEnv): string | undefined {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function get_default_app_origin(): string {
  if (typeof window !== "undefined" && window.location.origin !== "null") {
    return window.location.origin;
  }

  return "http://localhost:5173";
}

const app_origin = trim_trailing_slash(read_env("VITE_APP_ORIGIN") ?? get_default_app_origin());

/** Shared frontend configuration for API, auth, and collaboration clients. */
export const runtime_config: RuntimeConfig = {
  app_origin,
  api_base_url: trim_trailing_slash(
    read_env("VITE_API_BASE_URL") ?? read_env("VITE_API_URL") ?? "http://localhost:3000/api/v1",
  ),
  collaboration_ws_url: trim_trailing_slash(
    read_env("VITE_COLLABORATION_WS_URL") ??
      read_env("VITE_COLLAB_WS_URL") ??
      "ws://localhost:3003/document",
  ),
  collaboration_enabled: read_env("VITE_ENABLE_COLLABORATION") !== "false",
  supabase_url: read_env("VITE_SUPABASE_URL"),
  supabase_anon_key: read_env("VITE_SUPABASE_ANON_KEY"),
};

/** OAuth redirect URL registered with Supabase for sign-in flows. */
export function get_auth_redirect_url(): string {
  return `${runtime_config.app_origin}/documents`;
}
