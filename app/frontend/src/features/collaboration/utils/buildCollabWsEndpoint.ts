/**
 * Build the collaboration websocket endpoint from base URL, doc_id and token.
 */
export function buildCollabWsEndpoint(ws_base_url: string, doc_id: string, token: string): string {
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
export function buildCollabProviderConfig(
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
    endpoint: buildCollabWsEndpoint(normalized_base_url, normalized_doc_id, trimmed_token),
  };
}
