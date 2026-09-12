import { test, expect } from "@playwright/test";

/**
 * The blocking subset. Every test here must be deterministic against a freshly
 * seeded database — no conditional assertions, no `if (count > 0)`. If a test
 * cannot meet that bar it belongs in the advisory suite, not here.
 *
 * Tagged @smoke; run with `pnpm test:e2e:smoke`.
 */

test.describe("@smoke critical paths", () => {
  test("an unauthenticated visitor is redirected to login @smoke", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/findings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the health endpoint reports ok @smoke", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  test.describe("as an auditor", () => {
    test.use({ storageState: "playwright/.auth/auditor.json" });

    test("the findings list renders seeded observations @smoke", async ({
      page,
    }) => {
      await page.goto("/findings");
      await expect(
        page.getByRole("heading", { name: /findings/i }),
      ).toBeVisible();
      await expect(page.getByRole("table")).toBeVisible();
      await expect(page.locator("tbody tr").first()).toBeVisible();
    });

    test("the dashboard renders without a server error @smoke", async ({
      page,
    }) => {
      const response = await page.goto("/dashboard");
      expect(response?.status()).toBeLessThan(400);
      await expect(
        page.getByRole("heading", { name: /dashboard/i }),
      ).toBeVisible();
    });

    test("an observation can be created and opened @smoke", async ({
      page,
    }) => {
      await page.goto("/findings/new");
      await page.getByLabel(/^title/i).fill("Smoke: cash retention breach");
      await page.getByLabel(/condition/i).fill("Cash held above the limit");
      await page.getByLabel(/criteria/i).fill("RBI cash retention limit");
      await page.getByLabel(/cause/i).fill("Manual reconciliation gap");
      await page.getByLabel(/effect/i).fill("Elevated operational risk");
      await page
        .getByLabel(/recommendation/i)
        .fill("Automate the daily reconciliation");

      await page.getByRole("combobox", { name: /severity/i }).click();
      await page
        .getByRole("option", { name: /^high$/i })
        .first()
        .click();
      await page.getByRole("combobox", { name: /^branch$/i }).click();
      await page.getByRole("option").first().click();
      await page.getByRole("combobox", { name: /audit area/i }).click();
      await page.getByRole("option").first().click();

      await page.getByRole("button", { name: /create observation/i }).click();
      await expect(page).toHaveURL(/\/findings\/[a-f0-9-]+/);
      await expect(page.getByText(/created/i).first()).toBeVisible();
    });
  });

  test.describe("as an auditee", () => {
    test.use({ storageState: "playwright/.auth/auditee.json" });

    test("an auditee cannot reach the admin area @smoke", async ({ page }) => {
      // requirePermission redirects to /dashboard?unauthorized=true; denial is
      // a browser alert(), not DOM text. Soft redirects often drop the query,
      // so assert the destination URL — same property as permission-guards.
      await page.goto("/admin/users");
      await expect(page).toHaveURL(/\/dashboard(\?|$)/);
      await expect(page).not.toHaveURL(/\/admin\b/);
    });
  });
});
