import { expect, test } from "@playwright/test";

test("redirects protected routes to login without a session", async ({ page }) => {
  for (const path of ["/documents", "/documents/fake-id", "/settings"]) {
    await page.goto(path);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("dialog", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  }
});
