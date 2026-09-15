import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Module admin page accessibility", () => {
  test.use({ storageState: "playwright/.auth/cae.json" });

  test("module admin page has no critical axe violations", async ({ page }) => {
    await page.goto("/settings/modules");
    await page.waitForSelector("h1");

    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });

  test("the add-statement side panel closes on Escape", async ({ page }) => {
    await page.goto("/settings/modules");
    await page.getByRole("button", { name: "Add bank statement" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});
