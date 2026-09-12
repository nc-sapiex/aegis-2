import { test as setup } from "@playwright/test";

/**
 * Authentication setup — creates storageState for 4 roles.
 *
 * Emails and password must match prisma/seed.ts exactly:
 *   - suresh.patil@apexbank.example → AUDITOR
 *   - priya.sharma@apexbank.example → CAE + AUDIT_MANAGER
 *   - amit.joshi@apexbank.example   → CCO
 *   - vikram.kulkarni@apexbank.example → AUDITEE + AUDITOR
 */

const TEST_PASSWORD = "TestPassword123!";

const users = [
  {
    role: "auditor",
    email: "suresh.patil@apexbank.example",
    password: TEST_PASSWORD,
    file: "playwright/.auth/auditor.json",
  },
  {
    role: "manager",
    email: "priya.sharma@apexbank.example",
    password: TEST_PASSWORD,
    file: "playwright/.auth/manager.json",
  },
  {
    role: "cae",
    email: "priya.sharma@apexbank.example",
    password: TEST_PASSWORD,
    file: "playwright/.auth/cae.json",
  },
  {
    role: "cco",
    email: "amit.joshi@apexbank.example",
    password: TEST_PASSWORD,
    file: "playwright/.auth/cco.json",
  },
  {
    role: "auditee",
    email: "vikram.kulkarni@apexbank.example",
    password: TEST_PASSWORD,
    file: "playwright/.auth/auditee.json",
  },
];

for (const user of users) {
  setup(`authenticate as ${user.role}`, async ({ page }) => {
    await page.goto("/login");

    // Wait for the form to hydrate (client component)
    await page.waitForSelector("input#email", { timeout: 15000 });

    // Fill by ID (reliable, matches the JSX id= attributes)
    await page.fill("input#email", user.email);
    await page.fill("input#password", user.password);

    // Click Sign In button
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    // Save state
    await page.context().storageState({ path: user.file });
    console.log(`✓ ${user.role} (${user.email})`);
  });
}
