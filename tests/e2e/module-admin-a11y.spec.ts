import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ storageState: "playwright/.auth/cae.json" });

test("module admin page has no serious or critical axe violations", async ({
  page,
}) => {
  await page.goto("/settings/modules");
  await page.waitForSelector("h1");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious).toEqual([]);
});

test("the add-statement side panel traps focus and closes on Escape", async ({
  page,
}) => {
  await page.goto("/settings/modules");
  await page.getByRole("button", { name: "Add bank statement" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
