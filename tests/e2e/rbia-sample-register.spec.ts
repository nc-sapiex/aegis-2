import { expect, test } from "@playwright/test";

test.describe("RBIA sample-account register", () => {
  test.use({ storageState: "playwright/.auth/auditor.json" });

  test("renders the binary register columns for a sampled module", async ({
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

    const moduleLink = page.locator('a[href*="/rbia/module/"]').first();
    await moduleLink.waitFor({ state: "visible" });
    const moduleHref = await moduleLink.getAttribute("href");
    expect(moduleHref).toBeTruthy();

    const sampleHref = String(moduleHref).replace(
      "/rbia/module/",
      "/rbia/examination/",
    );
    await page.goto(sampleHref);

    await expect(
      page.getByRole("heading", { name: /sample-account register/i }),
    ).toBeVisible();
    await expect(page.getByText(/sample · \d+ accounts/i)).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Compliant" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Violation" }),
    ).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "N/A" })).toBeVisible();
  });
});
