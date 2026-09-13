import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ storageState: "playwright/.auth/auditor.json" });

test("examination register has no critical axe violations", async ({ page }) => {
  await page.goto("/audit-execution");

  const rbiaLink = page.locator('a[href*="/rbia"]').first();
  await expect(rbiaLink).toBeVisible();

  const href = await rbiaLink.getAttribute("href");
  expect(href).toBeTruthy();

  await page.goto(href!);

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical).toEqual([]);
});
