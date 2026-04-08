import { supabase_client } from "./supabase";

/**
 * Base URL for all API requests routed through the API Gateway.
 * In development this points to the local docker-compose gateway.
 * In production this would be the deployed gateway URL.
 */
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:3000/api/v1";

/**
 * Generic HTTP client that attaches the Supabase JWT to every request.
 * All document/workspace API calls go through this client.
 *
 * @param path - API path relative to the base URL (e.g. "/documents").
 * @param options - Standard fetch RequestInit options.
 * @returns Parsed JSON response.
 * @throws Error if the response is not OK.
 */
export async function api_fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase_client.auth.getSession();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error_body = await response.json().catch(() => ({}));
    const message = (error_body as { error?: string }).error || `API error: ${response.status}`;
    throw new Error(message);
  }

  /* 204 No Content responses have no body */
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
