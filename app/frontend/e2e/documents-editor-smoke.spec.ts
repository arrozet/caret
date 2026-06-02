import { expect, test } from "@playwright/test";
import { fakeDocument, mockCaretApi, seedFakeSession } from "./fixtures";

test.describe("documents editor smoke flow", () => {
  test.beforeEach(async ({ page }) => {
    await seedFakeSession(page);
    await mockCaretApi(page);
  });

  test("lists documents, opens one, and shows the editor status bar", async ({ page }) => {
    await page.goto("/documents");

    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
    await page.getByRole("button", { name: /open workspace e2e workspace/i }).click();
    await expect(page.getByRole("button", { name: `Open ${fakeDocument.title}` })).toBeVisible();

    await page.getByRole("button", { name: `Open ${fakeDocument.title}` }).click();

    await expect(page).toHaveURL(new RegExp(`/documents/${fakeDocument.id}$`));
    await expect(page.getByText(fakeDocument.content_text)).toBeVisible();
    await expect(page.getByTestId("editor-status-bar")).toBeVisible();
    await expect(page.getByTestId("editor-status-bar")).toContainText("characters");
    await expect(page.getByTestId("editor-status-bar")).toContainText("Saved");
  });
});
