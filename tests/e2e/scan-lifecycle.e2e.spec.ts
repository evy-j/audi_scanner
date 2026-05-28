import { expect, test } from "@playwright/test";

test.describe("scan lifecycle", () => {
  test("loads the application shell", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });
});
