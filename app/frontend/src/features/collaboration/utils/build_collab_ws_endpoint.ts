/**
 * Build the collaboration websocket endpoint from base URL, doc_id and token.
 */
export function build_collab_ws_endpoint(
  ws_base_url: string,
  doc_id: string,
  token: string,
): string {
  const normalized_base_url = ws_base_url.replace(/\/+$/, "");
  const encoded_doc_id = encodeURIComponent(doc_id.trim());
  const trimmed_token = token.trim();
  const encoded_token = encodeURIComponent(trimmed_token);

  const query_suffix = trimmed_token.length > 0 ? `?token=${encoded_token}` : "";
  return `${normalized_base_url}/document/${encoded_doc_id}${query_suffix}`;
}

/**
 * Build websocket provider configuration and endpoint from the same source data.
 */
export function build_collab_provider_config(
  ws_base_url: string,
  doc_id: string,
  token: string,
): {
  server_url: string;
  room_name: string;
  params?: { token: string };
  endpoint: string;
} {
  const normalized_base_url = ws_base_url.replace(/\/+$/, "");
  const normalized_doc_id = doc_id.trim();
  const trimmed_token = token.trim();

  return {
    server_url: `${normalized_base_url}/document`,
    room_name: encodeURIComponent(normalized_doc_id),
    params: trimmed_token.length > 0 ? { token: trimmed_token } : undefined,
    endpoint: build_collab_ws_endpoint(normalized_base_url, normalized_doc_id, trimmed_token),
  };
}
