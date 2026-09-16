import { test, expect } from "@playwright/test";

/**
 * Spec §10: "A second tenant is seeded alongside and asserted untouched."
 *
 * This runs against the same seeded database as core-cycle.spec.ts, and it
 * must run AFTER it — the whole point is to read tenant B once tenant A's full
 * cycle has finished writing. `playwright.config.ts`'s `core` project runs both
 * specs in file order, and `core-cycle` sorts before `tenant-isolation`, so
 * this ordering is structural rather than something a reader has to remember.
 * Never reseed between the two.
 *
 * Tenant B is "Test Nagari Sahakari Bank Ltd" from prisma/seed.ts: one user
 * (admin@testbank.example, roles CEO + CAE) and exactly one Observation
 * ("Test Bank Finding — Cash Reserve", DRAFT, MEDIUM).
 *
 * Why the row count is exactly 1, verified from source rather than assumed:
 *   - src/data-access/observations.ts:52-56 — getObservations applies no
 *     status filter, so the seeded DRAFT row is listed like any other.
 *   - src/lib/access-scope.ts:44-52 — isBranchScopedObservationReader returns
 *     false for CEO/CAE, so this user sees the whole tenant, not one branch.
 *   - Every write core-cycle.spec.ts performs carries tenant A's tenantId from
 *     the session (ADR 0001), and RLS enforces it. If any of them leaked, this
 *     count would be greater than 1.
 */
test.describe("@smoke second-tenant isolation", () => {
  test.use({ storageState: "playwright/.auth/tenantb-admin.json" });

  test("a second tenant's findings list is unaffected by the first tenant's core-cycle run @smoke", async ({
    page,
  }) => {
    await page.goto("/findings");

    await expect(
      page.getByRole("heading", { name: /findings/i }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    // Exactly the pre-seeded observation, nothing from tenant A's cycle.
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").first()).toContainText(
      "Test Bank Finding — Cash Reserve",
    );

    // The header count is computed by a separate query (getObservationSummary)
    // than the table, so it is an independent witness of the same isolation.
    await expect(page.getByText(/1 findings across all audits/i)).toBeVisible();
  });

  test("tenant B cannot see tenant A's engagements @smoke", async ({
    page,
  }) => {
    // Tenant A has nine engagements after the seed chain and one more after
    // core-cycle.spec.ts creates its own. Tenant B was seeded with an audit
    // plan but no engagements, and RLS plus the DAL's `where: { tenantId }`
    // must keep it that way.
    await page.goto("/audit-execution");
    await expect(page.getByText(/^0 engagements total$/)).toBeVisible();
  });
});
