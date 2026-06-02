import { expect, test } from "@playwright/test";

test.describe("public auth surfaces", () => {
  test("loads the landing page and opens the Google auth modal", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /write with clarity\. think with precision/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /start writing for free/i })).toBeVisible();

    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("dialog", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
    await expect(page.getByText(/use your google account to continue/i)).toBeVisible();
  });
});
