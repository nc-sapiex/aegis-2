import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("RBIA examination register accessibility", () => {
  test.use({ storageState: "playwright/.auth/auditor.json" });

  test("examination register has no critical axe violations", async ({
    page,
  }) => {
    await page.goto("/audit-execution");

    const engagementLink = page
      .locator('a[href*="/audit-execution/"][href$="/rbia"]')
      .first();
    await engagementLink.waitFor({ state: "visible" });
    const engagementHref = await engagementLink.getAttribute("href");
    expect(engagementHref).toBeTruthy();

    await page.goto(String(engagementHref));

    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === "critical");
    expect(critical).toEqual([]);
  });
});
