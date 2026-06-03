import type { Page, Route } from "@playwright/test";

export const fakeWorkspace = {
  id: "workspace-e2e",
  slug: "e2e",
  name: "E2E Workspace",
  kind: "personal",
  created_by_user_id: "user-e2e",
  role: "owner",
  shared_with: [],
  created_at: "2026-06-02T10:00:00.000Z",
  updated_at: "2026-06-02T10:00:00.000Z",
};

export const fakeDocument = {
  id: "doc-e2e",
  workspace_id: fakeWorkspace.id,
  folder_id: null,
  title: "E2E Smoke Document",
  status: "active",
  visibility: "private",
  owner_user_id: "user-e2e",
  content_json: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "The editor opens with mocked content." }],
      },
    ],
  },
  content_text: "The editor opens with mocked content.",
  created_at: "2026-06-02T10:00:00.000Z",
  updated_at: "2026-06-02T10:00:00.000Z",
};

const fakeUser = {
  id: "user-e2e",
  aud: "authenticated",
  role: "authenticated",
  email: "e2e@caret.test",
  email_confirmed_at: "2026-06-02T10:00:00.000Z",
  phone: "",
  confirmed_at: "2026-06-02T10:00:00.000Z",
  last_sign_in_at: "2026-06-02T10:00:00.000Z",
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: {
    full_name: "E2E User",
    avatar_url: null,
  },
  identities: [],
  created_at: "2026-06-02T10:00:00.000Z",
  updated_at: "2026-06-02T10:00:00.000Z",
};

const fakeSession = {
  access_token: "fake-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4_102_444_800,
  refresh_token: "fake-refresh-token",
  user: fakeUser,
};

/**
 * Seeds the Supabase auth storage key used by the Playwright webServer URL.
 */
export async function seedFakeSession(page: Page) {
  await page.addInitScript((session) => {
    window.localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
  }, fakeSession);
}

/**
 * Stubs the minimal gateway API surface needed by the document smoke tests.
 */
export async function mockCaretApi(page: Page) {
  await page.route("**/rest/v1/user_profiles**", async (route) => {
    await json(route, [
      {
        display_name: "E2E User",
        avatar_url: null,
      },
    ]);
  });

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");

    if (request.method() === "GET" && path === "/workspaces") {
      await json(route, [fakeWorkspace]);
      return;
    }

    if (request.method() === "GET" && path === "/documents/shared") {
      await json(route, []);
      return;
    }

    if (request.method() === "GET" && path === "/documents") {
      await json(route, [fakeDocument]);
      return;
    }

    if (request.method() === "GET" && path === `/documents/${fakeDocument.id}`) {
      await json(route, fakeDocument);
      return;
    }

    if (request.method() === "GET" && path === "/folders/all") {
      await json(route, []);
      return;
    }

    if (request.method() === "PATCH" && path === `/documents/${fakeDocument.id}`) {
      await json(route, fakeDocument);
      return;
    }

    await json(route, { error: `Unhandled E2E API route: ${request.method()} ${path}` }, 404);
  });
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
