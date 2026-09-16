import { expect, test } from "@playwright/test";

// Issue #155: the report page's "Generate PDF/Excel Report" buttons pointed
// at /audit-execution/[engagementId]/generate-pdf and .../generate-xlsx,
// neither of which is a route — both 404'd. They must instead trigger the
// same server actions /reports uses (report-generator.tsx), with the
// engagement id this page already has in scope.
test.describe("audit report generation buttons", () => {
  test.use({ storageState: "playwright/.auth/cae.json" });

  test("Generate PDF/Excel buttons trigger generation instead of linking to a dead route", async ({
    page,
  }) => {
    await page.goto("/audit-execution");

    // Rows navigate via router.push, not <a href> — click the first one and
    // read the engagement id back off the resulting URL.
    const firstRow = page.locator("table tbody tr").first();
    await firstRow.waitFor({ state: "visible" });
    await firstRow.click();
    await page.waitForURL(/\/audit-execution\/[a-f0-9-]+/);

    const engagementId = page
      .url()
      .match(/\/audit-execution\/([a-f0-9-]+)/)![1];

    await page.goto(`/audit-execution/${engagementId}/report`);

    // No dead-route links.
    await expect(
      page.locator('a[href$="/generate-pdf"], a[href$="/generate-xlsx"]'),
    ).toHaveCount(0);

    const pdfButton = page.getByRole("button", {
      name: /generate pdf report/i,
    });
    await expect(pdfButton).toBeVisible();
    await expect(pdfButton).toBeEnabled();

    await pdfButton.click();

    // Still on the report page (no navigation to a 404), and the action fired
    // — proven by a toast, success or failure, rather than asserting on S3.
    await expect(page).toHaveURL(
      new RegExp(`/audit-execution/${engagementId}/report$`),
    );
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible({
      timeout: 15000,
    });
  });
});
