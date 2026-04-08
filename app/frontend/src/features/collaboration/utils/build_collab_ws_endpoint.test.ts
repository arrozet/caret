import { describe, expect, it } from "vitest";
import { buildCollabProviderConfig, buildCollabWsEndpoint } from "./buildCollabWsEndpoint";

describe("build_collab_ws_endpoint", () => {
  it("builds ws://localhost:3003/document/doc-1?token=abc", () => {
    const endpoint = buildCollabWsEndpoint("ws://localhost:3003", "doc-1", "abc");

    expect(endpoint).toBe("ws://localhost:3003/document/doc-1?token=abc");
  });

  it("trims trailing slash in base", () => {
    const endpoint = buildCollabWsEndpoint("ws://localhost:3003/", "doc-1", "abc");

    expect(endpoint).toBe("ws://localhost:3003/document/doc-1?token=abc");
  });

  it("URL-encodes doc_id and token", () => {
    const endpoint = buildCollabWsEndpoint(
      "ws://localhost:3003",
      "doc/with spaces",
      "token+with?chars",
    );

    expect(endpoint).toBe(
      "ws://localhost:3003/document/doc%2Fwith%20spaces?token=token%2Bwith%3Fchars",
    );
  });

  it("omits token query when token is empty", () => {
    const endpoint = buildCollabWsEndpoint("ws://localhost:3003", "doc-1", "   ");

    expect(endpoint).toBe("ws://localhost:3003/document/doc-1");
  });
});

describe("build_collab_provider_config", () => {
  it("returns provider config aligned with endpoint", () => {
    const config = buildCollabProviderConfig("ws://localhost:3003/", "doc 1", "abc");

    expect(config.server_url).toBe("ws://localhost:3003/document");
    expect(config.room_name).toBe("doc%201");
    expect(config.params).toEqual({ token: "abc" });
    expect(config.endpoint).toBe("ws://localhost:3003/document/doc%201?token=abc");
  });

  it("returns undefined params when token is empty", () => {
    const config = buildCollabProviderConfig("ws://localhost:3003", "doc-1", " ");

    expect(config.params).toBeUndefined();
    expect(config.endpoint).toBe("ws://localhost:3003/document/doc-1");
  });
});
