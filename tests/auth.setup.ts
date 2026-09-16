import { test as setup } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * Authentication setup — creates storageState per role fixture.
 *
 * Emails and password must match prisma/seed.ts exactly:
 *   - suresh.patil@apexbank.example → AUDITOR
 *   - priya.sharma@apexbank.example → CAE + AUDIT_MANAGER
 *   - amit.joshi@apexbank.example   → CCO
 *   - vikram.kulkarni@apexbank.example → AUDITEE + AUDITOR
 *   - deepa.rao@apexbank.example → AUDIT_MANAGER only, so RAM's maker-checker
 *     rule has two distinct people to work with
 *   - neha.kulkarni@apexbank.example → LEAD_AUDITOR (the only seeded role
 *     with `rbia:examine`; core-cycle.spec.ts needs it for fieldwork)
 *   - admin@testbank.example → CEO + CAE of tenant B, for the isolation spec
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
  {
    role: "audit-manager",
    email: "deepa.rao@apexbank.example",
    password: TEST_PASSWORD,
    file: "playwright/.auth/audit-manager.json",
  },
  {
    role: "lead-auditor",
    email: "neha.kulkarni@apexbank.example",
    password: TEST_PASSWORD,
    file: "playwright/.auth/lead-auditor.json",
  },
  {
    role: "tenantb-admin",
    email: "admin@testbank.example",
    password: TEST_PASSWORD,
    file: "playwright/.auth/tenantb-admin.json",
  },
];

/**
 * One sign-in per distinct email, not per fixture file.
 *
 * `src/lib/auth.ts:96-99` rate-limits POST /sign-in/email to 10 per IP per 15
 * minutes, and the limiter is in-memory, so a long-lived dev server keeps
 * counting across runs. `cae` and `manager` are the same seeded user
 * (priya.sharma dual-hats CAE + AUDIT_MANAGER — seed decision D13), so logging
 * in once and writing both storageState files keeps this at 6 sign-ins. Seven
 * would leave no room for the CI retry of a failed setup, and the failure mode
 * is a silent 429: the login form simply never navigates.
 */
const byEmail = new Map<string, typeof users>();
for (const user of users) {
  const group = byEmail.get(user.email) ?? [];
  group.push(user);
  byEmail.set(user.email, group);
}

/**
 * True when the saved cookies still resolve to a signed-in session.
 *
 * Every re-run of the suite against one long-lived dev server spends six more
 * of the ten permitted sign-ins, so the third run in a fifteen-minute window
 * fails on a 429 that surfaces only as "the login form never navigated". CI
 * starts a fresh server per run and never sees it; a developer iterating
 * locally sees it constantly. Reusing a session that still works costs one
 * navigation and removes the whole class of failure.
 *
 * A reseed invalidates these cookies — the Session rows are dropped and the
 * users are recreated with new ids — so this correctly falls through to a real
 * login after `pnpm db:seed`, rather than carrying a dead session forward.
 *
 * Both halves of that were verified empirically against the running app, not
 * assumed:
 *   - a context carrying a *dropped* session lands on
 *     `/login?redirect=%2Fdashboard`, so the `/login` test below is what makes
 *     this fall through rather than carry a dead session forward;
 *   - a context carrying a live session lands on `/dashboard`.
 *
 * `baseURL` is passed explicitly rather than relied on. Playwright 1.63 does
 * apply the project's `use` options to `browser.newContext()` — including
 * `storageState`, which is why the explicit one here matters — but that is not
 * behaviour worth depending on: if it ever stopped holding, the relative
 * `goto` would throw, the `catch` would report "not valid", and the only
 * symptom would be that this optimisation silently stopped optimising.
 */
async function storageStateStillValid(
  browser: import("@playwright/test").Browser,
  file: string,
  baseURL: string | undefined,
): Promise<boolean> {
  if (!existsSync(file)) return false;
  const context = await browser.newContext({ storageState: file, baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/dashboard");
    return !/\/login/.test(page.url());
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

for (const [email, fixtures] of byEmail) {
  const roles = fixtures.map((f) => f.role).join(" + ");

  setup(`authenticate as ${roles}`, async ({ page, browser, baseURL }) => {
    if (
      (
        await Promise.all(
          fixtures.map((f) => storageStateStillValid(browser, f.file, baseURL)),
        )
      ).every(Boolean)
    ) {
      console.log(`✓ ${roles} (${email}) — reused existing session`);
      return;
    }

    await page.goto("/login");

    // Wait for the form to hydrate (client component)
    await page.waitForSelector("input#email", { timeout: 15000 });

    // Fill by ID (reliable, matches the JSX id= attributes)
    await page.fill("input#email", email);
    await page.fill("input#password", TEST_PASSWORD);

    // Click Sign In button
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    // Save state — one file per fixture that maps to this user
    for (const fixture of fixtures) {
      await page.context().storageState({ path: fixture.file });
    }
    console.log(`✓ ${roles} (${email})`);
  });
}
