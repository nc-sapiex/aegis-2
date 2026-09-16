# E2E, Deployment Drills, and Runbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The program's exit gate (spec §11 week 14: "Runbook executed on a clean machine") is met — a deterministic Playwright run proves the whole RBIA cycle works and gates every merge; every dashboard page and action is permission-checked with no gaps; board reports actually generate; a clean Ubuntu machine can be provisioned, installed from the release image, and restored from backup by running one script each; the AWS checklist has been run once; and the runbook, the security statement, and `docs/architecture.md` describe the system that actually exists rather than the one that existed before this program started.

**Architecture:** This plan is the integration and deployment capstone — it depends on all six prior plans landing (tenant isolation, audit chain, adapters/licensing, module framework, content packs, module admin/reporting) because the E2E test in Task 3 exercises every one of them in a single run, and the on-prem installer in Task 4 packages the finished application, not an intermediate state. Nothing here introduces new domain logic; it wires together what the other six plans built, closes the two remaining spec gaps that were explicitly deferred to week 12+ (`generate-board-report`, authorization-gap enforcement), and produces the operational artifacts (compose files, drill scripts, checklists, the runbook, the security statement) a customer's ops team and the vendor's own pre-sale review actually need.

**Tech Stack:** Playwright (already the E2E framework), pg-boss (existing job runner, `generate-board-report` is already a registered no-op job name), Docker Compose (`docker-compose.yml` already exists for the app+Postgres pair; this plan adds MinIO/MailHog services matching the adapters plan's `ObjectStore`/`Mailer` drivers), Multipass (or a throwaway Hostinger VPS via the already-connected `mcp__hostinger__VPS_*` tools — see Task 5's note on which to use) for the install drill, plain bash for `restore.sh` and the drill scripts.

**Spec:** `docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md` §8.5 (backups/encryption), §9 (consolidation: board report, authorization gaps, BOARD_OBSERVER), §10 (verification: static suites, integration, E2E, install drills, load), §11 weeks 12-14, §12 (spike-fails fallback documented in the ADR and the security statement), §13 (after go-live backlog — this plan's security statement and architecture.md must accurately describe this as future work, not shipped).

**Depends on:** all six prior plans (`2026-09-13-tenant-isolation-rls.md`, `2026-09-13-audit-chain.md`, `2026-09-13-adapters-migrations-licensing.md`, `2026-09-13-module-framework.md`, `2026-09-13-content-packs.md`, `2026-09-13-module-admin-reporting.md`). This plan must not start until those six are merged to `main` — its E2E test (Task 3) exercises the RLS-protected DAL, the audit chain, the module-native framework, packs, and the reporting engine in one deterministic run, and would need constant rewriting against a moving target otherwise.

## Global Constraints

- Tenant id comes from the session only: `getRequiredSession()`. Never from params, body, headers or query.
- Every write to an audited table goes through `withAuditedMutation`.
- Server actions return `{ success, data } | { success: false, error }`, never throw.
- Branch protection on `main` requires CI green (spec §9) — Task 3's E2E suite becomes a required check as part of that protection, not an optional one.
- Never merge with `--auto` or any flag bypassing CI (standing instruction).
- No agent access to production, a live VPS used for customer data, AWS, or a live database — the install/restore drills in this plan run against a throwaway VM or VPS created and destroyed for the drill only, never against `vps-control`/`vps-worker` or any customer-facing host.
- Secrets live in `~/.platform-secrets`, mode 700, never in a repo. The drill scripts in this plan generate throwaway secrets for the drill VM and discard them; they never read or write `~/.platform-secrets`.
- This is a pre-launch repo (`CLAUDE.md`: "Deployment state: not deployed"). Every doc this plan writes (runbook, security statement, architecture.md) must say so plainly where it's still true, and must not claim a production deployment exists.

---

## File structure

| File                                                                   | Responsibility                                                                                                                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/__tests__/authorization-gaps.test.ts` (new)                   | Static test: every `(dashboard)` page file calls `requirePermission`/`requireAnyPermission`/`requireOnboardingPermission`; every server action file calls `hasPermission`.         |
| `src/lib/permissions.ts`, `src/lib/nav-items.ts` (modify)              | `BOARD_OBSERVER` gets real read permissions, or every reference to it is removed — decided in Task 1 based on what's found.                                                        |
| `src/jobs/generate-board-report.ts` (new)                              | Real handler: ISSUED observations for a period → PDF → object store → `BoardReport` audit record.                                                                                  |
| `src/jobs/index.ts` (modify)                                           | Wire the new handler in place of the logging-only stub.                                                                                                                            |
| `src/jobs/__integration__/generate-board-report.test.ts` (new)         | Integration test.                                                                                                                                                                  |
| `tests/e2e/core-cycle.spec.ts` (new)                                   | The full deterministic core-cycle run from spec §10, tagged `@smoke`.                                                                                                              |
| `tests/e2e/tenant-isolation.spec.ts` (new)                             | The "second tenant seeded alongside and asserted untouched" half of §10's E2E requirement, factored separately since it's a different assertion shape than the cycle test.         |
| `docker-compose.yml` (modify)                                          | Add `minio` and `mailhog` services so the full on-prem stack (app, Postgres, object store, mail) runs from one file, matching the adapters plan's driver seams.                    |
| `docker-compose.onprem.yml` (new)                                      | On-prem overlay: named volumes for the bank's backup path, no dev-only ports exposed, `restart: always`.                                                                           |
| `scripts/aegis-install.sh` (new)                                       | The one-command clean-machine installer the runbook and the install drill both call.                                                                                               |
| `scripts/backup.sh`, `scripts/restore.sh` (new)                        | Nightly `pg_dump` + MinIO mirror; scripted restore.                                                                                                                                |
| `scripts/drills/install-drill.sh` (new)                                | Provisions a clean VM, runs `aegis-install.sh`, runs the smoke suite, records the result.                                                                                          |
| `scripts/drills/restore-drill.sh` (new)                                | Takes a backup from the E2E database, restores it on the drill VM, verifies row counts.                                                                                            |
| `docs/ops/aws-checklist.md` (new)                                      | The manual, run-once-before-go-live AWS checklist (RDS, S3, PITR, security groups, encryption defaults).                                                                           |
| `docs/ops/runbook.md` (rewrite)                                        | Onboarding runbook, updated to describe the real install/restore/upgrade paths this plan builds, replacing the current "there is nothing to operate" framing where it's now false. |
| `docs/ops/security-statement.md` (new)                                 | Customer-facing security statement, written from the claims audit in Task 8.                                                                                                       |
| `docs/architecture.md` (rewrite)                                       | Brought current with everything the seven plans built; the stale i18n/Sentry/v5 passages are removed.                                                                              |
| `docs/ops/install-drill-log.md`, `docs/ops/restore-drill-log.md` (new) | Dated records of each drill run, per spec §10 "Recorded per release."                                                                                                              |

---

### Task 1: Authorization-gap static test, and BOARD_OBSERVER decision

**Files:**

- Create: `src/lib/__tests__/authorization-gaps.test.ts`
- Modify (as needed, based on what the test finds): any `(dashboard)/**/page.tsx` missing a guard call, any `src/actions/**/*.ts` missing `hasPermission`; `src/lib/permissions.ts`, `src/lib/nav-items.ts` for the `BOARD_OBSERVER` decision.

**Interfaces:**

- Produces: a static test enforcing spec §10's "`hasPermission` in every action; `requirePermission` in every dashboard page."

- [x] **Step 1: Write the static test**

```ts
// src/lib/__tests__/authorization-gaps.test.ts
import { describe, expect, it } from "vitest";
import { globSync } from "glob";
import { readFileSync } from "node:fs";

const GUARD_CALLS = [
  "requirePermission(",
  "requireAnyPermission(",
  "requireOnboardingPermission(",
];

describe("authorization gaps", () => {
  it("every (dashboard) page.tsx calls a page guard", () => {
    const pages = globSync("src/app/(dashboard)/**/page.tsx", {
      cwd: process.cwd(),
    });
    expect(pages.length).toBeGreaterThan(0);
    const unguarded = pages.filter((path) => {
      const content = readFileSync(path, "utf-8");
      return !GUARD_CALLS.some((call) => content.includes(call));
    });
    expect(unguarded).toEqual([]);
  });

  it("every server action file checks hasPermission", () => {
    const actionFiles = globSync("src/actions/**/*.ts", {
      cwd: process.cwd(),
      ignore: ["**/*.test.ts", "**/schemas.ts", "**/__integration__/**"],
    });
    const unguarded = actionFiles.filter((path) => {
      const content = readFileSync(path, "utf-8");
      if (!content.includes('"use server"')) return false; // not an action entry point (a shared helper)
      return !content.includes("hasPermission(");
    });
    expect(unguarded).toEqual([]);
  });
});
```

Read how the tenant-predicate static test (`src/data-access/__tests__/tenant-isolation.test.ts` per CLAUDE.md, or wherever the existing "literal audited-mutation allowlist" static test lives) does its file-scanning, and match its glob/ignore conventions rather than inventing a different pattern — this repo already has at least one static-analysis test of this shape.

- [x] **Step 2: Run it, expect real failures**

Run: `pnpm vitest run src/lib/__tests__/authorization-gaps.test.ts`
Expected: FAIL, listing the actual unguarded pages/actions in this codebase. This is real discovery, not a scripted result — the list depends on what's actually in the repo at the time this task runs, after the six dependency plans have landed.

- [x] **Step 3: Fix every reported gap**

For each unguarded page, add the appropriate `require*` call per `src/lib/guards.ts`'s existing pattern (read a neighboring guarded page first to match its exact usage). For each unguarded action, add `hasPermission(session.user.roles, "...")` with the permission key that best matches the action's effect (read `src/lib/permissions.ts`'s existing `Permission` union for the closest match; do not invent a new permission key without checking whether one already covers this action).

- [x] **Step 4: Resolve `BOARD_OBSERVER`**

Run: `grep -rn "BOARD_OBSERVER" src/lib/permissions.ts src/lib/nav-items.ts` and read every match. Per spec §9: "`BOARD_OBSERVER` gets real read permissions or is removed." Decide based on what's found — if `BOARD_OBSERVER` already has zero permissions wired to it anywhere (a dead enum value with no `hasPermission` grant), remove it from the `Role` enum's actual usages (the Prisma enum itself may need a migration if it's a DB-backed enum — check `prisma/schema.prisma`'s `Role` enum before removing a value that existing seeded rows might reference) and from `nav-items.ts`; if it has partial wiring, complete it with real read-only grants (dashboard, findings list, reports — not create/update/delete on anything) matching what a board-level read observer role should plausibly see.

- [x] **Step 5: Run the full suite**

Run: `pnpm vitest run src/lib/__tests__/authorization-gaps.test.ts && pnpm tsc --noEmit && pnpm test:unit`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/lib/__tests__/authorization-gaps.test.ts src/lib/permissions.ts src/lib/nav-items.ts
git commit -m "test(auth): static authorization-gap test; close every gap it finds; resolve BOARD_OBSERVER"
```

---

### Task 2: Implement `generate-board-report`

**Files:**

- Create: `src/jobs/generate-board-report.ts`
- Create: `src/jobs/__integration__/generate-board-report.test.ts`
- Modify: `src/jobs/index.ts`

**Interfaces:**

- Consumes: `ObjectStore` (adapters plan), `withAuditedMutation`, the `AuditSummaryDocument`/kernel PDF primitives (module-admin-reporting plan's Task 10 output — read that plan's landed `generic-module-section.tsx`/kernel document component before writing this, since a board report is a kernel-sections-only document, no module sections).
- Produces: `processGenerateBoardReport(payload: { tenantId: string; periodStart: string; periodEnd: string; requestedById: string }): Promise<{ reportUrl: string }>`.

- [x] **Step 1: Write the failing integration test**

```ts
// src/jobs/__integration__/generate-board-report.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processGenerateBoardReport } from "../generate-board-report";
import {
  integrationOwner,
  createTenant,
  createUser,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

let tenantId: string;
let userId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    const tenant = await createTenant("Board Report Bank");
    tenantId = tenant.id;
    userId = (await createUser(tenantId, ["CAE"])).id;
    const branch = await integrationOwner.branch.create({
      data: { tenantId, name: "B1", code: "B1", loanProducts: [] },
    });
    await integrationOwner.observation.create({
      data: {
        tenantId,
        branchId: branch.id,
        title: "Cash breach",
        condition: "x",
        criteria: "x",
        cause: "x",
        effect: "x",
        recommendation: "x",
        severity: "HIGH",
        status: "ISSUED",
        raisedById: userId,
      },
    } as never);
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("processGenerateBoardReport", () => {
  it("generates a PDF covering ISSUED observations in the period and records a BoardReport", async () => {
    const result = await processGenerateBoardReport({
      tenantId,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      requestedById: userId,
    });
    expect(result.reportUrl).toBeTruthy();

    const record = await integrationOwner.boardReport.findFirstOrThrow({
      where: { tenantId },
    });
    expect(record.reportUrl).toBe(result.reportUrl);
  });
});
```

Confirm the actual `BoardReport` model's field names (read `prisma/schema.prisma`) before writing this test — `generate-pdf.ts`'s existing non-RBIA path already creates one via `withAuditedMutation(userActor(session), "board_report.generated", ...)`, so match that exact shape rather than guessing field names.

- [x] **Step 2: Run it to see it fail**

Run: `pnpm test:integration -- src/jobs/__integration__/generate-board-report.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// src/jobs/generate-board-report.ts
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { prismaForTenant } from "@/lib/prisma";
import { getObjectStore } from "@/lib/adapters/object-store";
import {
  withAuditedMutation,
  systemActor,
} from "@/data-access/audited-mutation";
import { BoardReportDocument } from "@/components/pdf-report/board-report";

export async function processGenerateBoardReport(payload: {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  requestedById: string;
}): Promise<{ reportUrl: string }> {
  const { tenantId, periodStart, periodEnd, requestedById } = payload;
  const db = prismaForTenant(tenantId);

  const observations = await db.observation.findMany({
    where: {
      tenantId,
      status: "ISSUED",
      createdAt: { gte: new Date(periodStart), lte: new Date(periodEnd) },
    },
    include: { branch: true },
  });

  const buffer = await renderToBuffer(
    React.createElement(BoardReportDocument, {
      observations,
      periodStart,
      periodEnd,
    }) as never,
  );
  const store = getObjectStore();
  const key = `board-reports/${tenantId}/${periodStart}-${periodEnd}-${Date.now()}.pdf`;
  await store.put(key, Buffer.from(buffer), "application/pdf");
  const reportUrl = key;

  return withAuditedMutation(
    systemActor(tenantId),
    "board_report.generated",
    async (tx) => {
      await tx.boardReport.create({
        data: {
          tenantId,
          reportUrl,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
          requestedById,
          observationCount: observations.length,
        },
      });
      return { reportUrl };
    },
  );
}
```

Confirm `systemActor` exists in `src/data-access/audited-mutation.ts` (a pg-boss job has no session) — if only `userActor(session)` exists today, this is the first job-context caller and needs a `systemActor(tenantId)` variant added to that file; read the file before assuming either name is already there. Confirm `getObjectStore()`'s real export name from the adapters plan's landed code (this plan's research found the interface as `ObjectStore { put, presignPut, presignGet, delete }` per spec §8.1 but not its factory function's exact name).

- [x] **Step 4: Wire into `src/jobs/index.ts`**

```ts
import { processGenerateBoardReport } from "./generate-board-report";

// replace the logging-only handler:
await boss.work(JOBS.GENERATE_BOARD_REPORT, async (jobs) => {
  for (const job of jobs) {
    await processGenerateBoardReport(
      job.data as {
        tenantId: string;
        periodStart: string;
        periodEnd: string;
        requestedById: string;
      },
    );
  }
});
```

- [x] **Step 5: Run the tests**

Run: `pnpm test:integration -- src/jobs/__integration__/generate-board-report.test.ts && pnpm tsc --noEmit`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/jobs/generate-board-report.ts src/jobs/index.ts src/jobs/__integration__/generate-board-report.test.ts src/data-access/audited-mutation.ts
git commit -m "feat(jobs): implement generate-board-report, replacing the logging-only stub"
```

---

### Task 3: The core-cycle E2E test and the second-tenant isolation test

**Files:**

- Create: `tests/e2e/core-cycle.spec.ts`
- Create: `tests/e2e/tenant-isolation.spec.ts`

**Interfaces:**

- Consumes: `tests/auth.setup.ts`'s seeded users, `/api/download` (existing per spec §10).

This is the single most load-bearing test in the whole 7-plan program — it's spec §11's week-12 gate ("E2E gates merges") and it's the concrete proof the entire rebuild works end to end. Read the full existing `tests/e2e/observation-lifecycle.spec.ts` and `tests/e2e/smoke.spec.ts` first for the repo's actual Playwright idioms (role-based locators, `storageState` per describe block, the `@smoke` tag convention) before writing this — it must look like a natural extension of what's already there, not a new style.

- [x] **Step 1: Write the core-cycle test**

```ts
// tests/e2e/core-cycle.spec.ts
import { test, expect } from "@playwright/test";

/**
 * The full RBIA cycle in one deterministic run (spec §10). Tagged @smoke —
 * this becomes a required branch-protection check (spec §9/§11 week 12).
 * Every step must be deterministic against a freshly seeded database.
 */
test.describe("@smoke core cycle", () => {
  test.describe("as CAE", () => {
    test.use({ storageState: "playwright/.auth/cae.json" });

    test("onboarding through report generation @smoke", async ({ page }) => {
      // 1. RAM assessed and approved
      await page.goto("/risk-assessment");
      await page
        .getByRole("link", { name: /new assessment|start/i })
        .first()
        .click();
      // ... fill and submit the RAM form; assert it reaches an APPROVED-eligible state
      // Read the actual RAM pages/actions before writing these steps — this plan's
      // research did not trace the RAM flow's exact form fields, and inventing
      // selectors here would produce a test that fails on first run for the wrong
      // reason (missing element) rather than a real assertion failure.

      // 2. Plan generated
      await page.goto("/audit-plan");
      // ...

      // 3. Engagement opened; modules auto-selected from the branch profile
      await page.goto("/audit-execution");
      await page.getByRole("link", { name: /new engagement/i }).click();
      // ... select a branch with a known profile (seeded), submit, land on the engagement page
      // assert the auto-selected module list matches what that branch's profile implies
      // (per the module-framework plan's evaluateApplicability)

      // 4. Team assigned
      // ...

      // 5. Checklist and population modules examined on the five-point scale
      await page.goto(/* engagement rbia page */ "");
      // score every statement FULLY_COMPLIANT via the register's radiogroup keys (1-5)
      // per the examination-register component's documented keyboard interaction

      // 6. Score frozen
      // trigger the transition that freezes the score (per engagement-state-machine.ts)

      // 7. Observation raised and taken through maker-checker to ISSUED
      await page.goto("/findings/new");
      // ... fill and submit, then as manager/CCO progress it to ISSUED

      // 8. Branch responds
      // ...

      // 9. Escalation fires under a fake clock
      // If escalation needs real wall-clock time to fire, this step needs either a
      // test-only time-travel hook already in the repo (check src/jobs/__integration__
      // for how the existing compliance-escalation test fakes the clock) or is better
      // covered by the existing integration test for that job rather than E2E — do not
      // invent a new fake-clock mechanism here if one already exists for integration
      // tests; reuse it, or drop this step from the E2E path and note why in this
      // task's completion report.

      // 10. Report generated and downloaded through /api/download
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: /generate report|download report/i })
        .click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.(pdf|xlsx)$/);
    });
  });
});
```

The `// ...` placeholders above are explicitly not acceptable as delivered — they mark steps this plan's research did not trace far enough to write real selectors for (the RAM/plan/team-assignment/branch-response flows). Before marking this task complete, the implementer must open each of those pages in a running dev server (seeded via `pnpm db:seed`), read the actual DOM (role names, labels), and replace every placeholder with real Playwright actions and assertions — the same way `smoke.spec.ts`'s existing "observation can be created" test does it. A test file with `// ...` in it does not pass review.

- [x] **Step 2: Write the second-tenant isolation test**

```ts
// tests/e2e/tenant-isolation.spec.ts
import { test, expect } from "@playwright/test";

/**
 * Spec §10: "A second tenant is seeded alongside and asserted untouched."
 * This runs against the same seeded database as core-cycle.spec.ts and checks
 * that nothing core-cycle.spec.ts did leaked into the second tenant's data.
 */
test.describe("@smoke second-tenant isolation", () => {
  test("a second tenant's findings list is unaffected by the first tenant's core-cycle run", async ({
    page,
  }) => {
    // Requires the seed script to create a second tenant with its own storageState
    // file (e.g. playwright/.auth/tenant2-auditor.json) — check tests/auth.setup.ts
    // and prisma/seed.ts for whether a second tenant already exists in the seed data;
    // if not, this task must add one to the seed (a minimal second bank, one auditor
    // user, one pre-existing observation) since the E2E harness only re-seeds between
    // full runs, not between tests within a run.
    await page.goto("/findings");
    const rowCountBefore = await page.locator("tbody tr").count();
    expect(rowCountBefore).toBe(1); // exactly the pre-seeded observation, nothing from tenant 1's run
  });
});
```

- [x] **Step 3: Run against a real seeded dev environment**

Run: `pnpm db:seed && pnpm test:e2e:smoke -- tests/e2e/core-cycle.spec.ts tests/e2e/tenant-isolation.spec.ts`
Expected: PASS, deterministically, on a repeated run (`pnpm db:seed` re-run between attempts) — flakiness here is not acceptable per spec §10's "one deterministic run."

- [x] **Step 4: Wire into branch protection**

Confirm (or add, if missing) that `pnpm test:e2e:smoke` is a required CI check on `main`'s branch protection rule. This plan does not have direct GitHub admin access to change branch protection settings — flag this as a manual step for the user/repo admin to confirm via `gh api repos/nc-sapiex/aegis-2/branches/main/protection` rather than attempting it from an agent, per this plan's Global Constraints (no unrequested changes to CI/shared infra without confirmation).

- [x] **Step 5: Commit**

```bash
git add tests/e2e/core-cycle.spec.ts tests/e2e/tenant-isolation.spec.ts prisma/seed.ts
git commit -m "test(e2e): deterministic core-cycle run and second-tenant isolation check, gates merges per spec §10"
```

---

### Task 4: Full on-prem Docker Compose and the one-command installer

**Files:**

- Modify: `docker-compose.yml`
- Create: `docker-compose.onprem.yml`
- Create: `scripts/aegis-install.sh`

**Interfaces:**

- Consumes: `STORAGE_DRIVER`/`MAIL_DRIVER` env vars (adapters plan), `license.aegis` (licensing plan), `pnpm db:migrate`/`db:bootstrap`/`db:verify`/`db:seed` (existing).

- [x] **Step 1: Add MinIO and MailHog to `docker-compose.yml`**

```yaml
# addition to docker-compose.yml's services:
minio:
  image: minio/minio:latest
  container_name: aegis-minio
  restart: unless-stopped
  command: server /data --console-address ":9001"
  ports:
    - "${MINIO_PORT:-9000}:9000"
    - "${MINIO_CONSOLE_PORT:-9001}:9001"
  environment:
    MINIO_ROOT_USER: ${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}
    MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}
  volumes:
    - minio_data:/data
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
    interval: 10s
    timeout: 5s
    retries: 5

mailhog:
  image: mailhog/mailhog:latest
  container_name: aegis-mailhog
  restart: unless-stopped
  ports:
    - "${MAILHOG_SMTP_PORT:-1025}:1025"
    - "${MAILHOG_UI_PORT:-8025}:8025"
```

Add `minio_data` to the `volumes:` block. Add `STORAGE_DRIVER: ${STORAGE_DRIVER:-minio}` and `MAIL_DRIVER: ${MAIL_DRIVER:-smtp}` plus the MinIO/SMTP connection env vars to the `app` service's `environment:` block, matching whatever exact env var names the adapters plan's `ObjectStore`/`Mailer` factories actually read (read that plan's landed `src/lib/adapters/` code for the exact names before guessing).

- [x] **Step 2: On-prem overlay**

```yaml
# docker-compose.onprem.yml
services:
  postgres:
    volumes:
      - ${BACKUP_HOST_PATH:-./backups}:/backups:ro
  app:
    restart: always
  minio:
    restart: always
  mailhog:
    restart: always
```

The bank's own SMTP relay likely replaces MailHog in a real on-prem deployment — this overlay's `mailhog` service is for the install drill only; the runbook (Task 8) must say explicitly that a production on-prem install points `MAIL_DRIVER=smtp` at the bank's real relay, not at MailHog.

- [x] **Step 3: The installer script**

```bash
#!/usr/bin/env bash
# scripts/aegis-install.sh — one-command install on a clean machine.
# Usage: ./scripts/aegis-install.sh <license-file-path>
set -euo pipefail

LICENSE_FILE="${1:?Usage: aegis-install.sh <path-to-license.aegis>}"

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
command -v docker compose >/dev/null 2>&1 || command -v docker-compose >/dev/null || { echo "docker compose is required" >&2; exit 1; }

if [ ! -f .env ]; then
  echo "No .env found — copying .env.example. Edit it (secrets, hostnames) before continuing." >&2
  cp .env.example .env
  exit 1
fi

cp "$LICENSE_FILE" ./license.aegis

docker compose -f docker-compose.yml -f docker-compose.onprem.yml up -d --wait

docker compose exec -T app pnpm db:migrate
docker compose exec -T app pnpm db:bootstrap
docker compose exec -T app pnpm db:verify

echo "Install complete. Health check:"
curl -fsS http://localhost:3000/api/health | tee /dev/stderr | grep -q '"status":"ok"'
```

Confirm `pnpm db:migrate` actually exists as a script (spec §8.2 says the program moves to `prisma migrate`; the current `CLAUDE.md` commands list still shows `pnpm db:push` — this plan runs after the adapters/migrations/licensing plan, which is where that script gets added; if it hasn't landed by the time this task runs, use `pnpm db:generate && pnpm db:push` instead and note the discrepancy rather than silently assuming the newer command exists).

- [x] **Step 4: Manual dry run**

Run the script locally against a fresh `docker compose down -v` state (never against a database with data you want to keep) and confirm it reaches the health-check line successfully.

- [x] **Step 5: Commit**

```bash
git add docker-compose.yml docker-compose.onprem.yml scripts/aegis-install.sh
git commit -m "feat(ops): full on-prem compose stack (MinIO, MailHog) and one-command installer"
```

---

### Task 5: Install drill

**Files:**

- Create: `scripts/drills/install-drill.sh`
- Create: `docs/ops/install-drill-log.md`

**Interfaces:**

- Consumes: `scripts/aegis-install.sh` (Task 4).

Spec §10: "a script provisions a clean Ubuntu VM (Multipass or a throwaway VPS), installs from the image with the on-prem compose, restores a backup taken from the E2E database, runs the smoke suite." This task covers provisioning + install + smoke; Task 6 covers the restore half specifically, since it needs a real backup artifact from Task 3's E2E run as input.

- [x] **Step 1: Choose Multipass vs. a throwaway VPS**

Prefer Multipass (a local Ubuntu VM, no cloud credentials, no cost, fully within this session's sandbox) over provisioning a real Hostinger VPS through `mcp__hostinger__VPS_purchaseNewVirtualMachineV1` — creating and destroying a billed VPS for a drill is exactly the kind of hard-to-reverse, costs-real-money action that needs the user's explicit confirmation first per this plan's Global Constraints, and CLAUDE.md's standing rule is "no agent access to production/VPS/live DB/AWS" for anything beyond read-only checks. If Multipass is not installed, tell the user it's required (`brew install multipass` on macOS) rather than silently falling back to a cloud VM.

- [x] **Step 2: Write the drill script**

```bash
#!/usr/bin/env bash
# scripts/drills/install-drill.sh — provisions a clean Ubuntu VM, installs
# AEGIS from the release image, runs the smoke suite. Recorded per release
# (spec §10). Destroys the VM on exit regardless of outcome.
set -euo pipefail

VM_NAME="aegis-install-drill-$(date +%s)"

cleanup() {
  echo "Tearing down drill VM $VM_NAME"
  multipass delete "$VM_NAME" --purge || true
}
trap cleanup EXIT

multipass launch 22.04 --name "$VM_NAME" --cpus 2 --memory 4G --disk 20G
multipass exec "$VM_NAME" -- bash -c "curl -fsSL https://get.docker.com | sh"
multipass exec "$VM_NAME" -- sudo usermod -aG docker ubuntu

multipass transfer -r . "$VM_NAME":/home/ubuntu/aegis
# A throwaway license for the drill only — never a real customer license.
multipass transfer ./drills/fixtures/drill-license.aegis "$VM_NAME":/home/ubuntu/aegis/drill-license.aegis

multipass exec "$VM_NAME" -- bash -c "cd aegis && ./scripts/aegis-install.sh ./drill-license.aegis"

echo "Install succeeded on $VM_NAME. Running smoke suite against it..."
DRILL_IP=$(multipass info "$VM_NAME" --format json | jq -r ".info[\"$VM_NAME\"].ipv4[0]")
PLAYWRIGHT_BASE_URL="http://$DRILL_IP:3000" pnpm test:e2e:smoke

echo "Install drill passed for $VM_NAME on $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> docs/ops/install-drill-log.md
```

A throwaway drill license (`drills/fixtures/drill-license.aegis`) needs generating via `scripts/aegis-license` (licensing plan) with a short `expiresAt` and `allowedHosts` matching the drill VM's ephemeral hostname pattern — write that generation as a `Makefile`/`package.json` script (`pnpm drill:license`) rather than committing a real signed file with a real private key's signature to the repo; the private key itself never leaves `~/.platform-secrets`, so this script must be run once by a human with access to it, not by an agent, and its _output_ (the signed `.aegis` file) is what gets committed to `drills/fixtures/`.

- [x] **Step 3: Confirm with the user before the first real run**

This script provisions and destroys a local VM, which is reversible and local, but it also generates a throwaway license (Step 2's note) — before running the drill for the first time, confirm with the user who should generate that license and where its short-lived private-key signature comes from (per the standing rule that the vendor's real private key stays in `~/.platform-secrets` and is never handled by an agent).

- [x] **Step 4: Commit**

```bash
git add scripts/drills/install-drill.sh docs/ops/install-drill-log.md
git commit -m "feat(ops): install drill — clean-VM provision, install, smoke suite, recorded per release"
```

---

### Task 6: Backup, restore, and the restore drill

**Files:**

- Create: `scripts/backup.sh`, `scripts/restore.sh`
- Create: `scripts/drills/restore-drill.sh`
- Create: `docs/ops/restore-drill-log.md`

**Interfaces:**

- Consumes: `pg_dump`/`pg_restore`, the MinIO `mc mirror` CLI (or the S3-compatible API directly).

- [x] **Step 1: Backup script**

```bash
#!/usr/bin/env bash
# scripts/backup.sh — nightly pg_dump + MinIO mirror to a bank-provided path
# (spec §8.5). 30-day retention.
set -euo pipefail

BACKUP_DIR="${BACKUP_HOST_PATH:-./backups}/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-aegis}" "${POSTGRES_DB:-aegis}" | gzip > "$BACKUP_DIR/db.sql.gz"

mc mirror --overwrite "aegis-minio/${S3_BUCKET_NAME:-aegis-evidence-prod}" "$BACKUP_DIR/objects/"

find "$(dirname "$BACKUP_DIR")" -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +

echo "Backup complete: $BACKUP_DIR"
```

- [x] **Step 2: Restore script**

```bash
#!/usr/bin/env bash
# scripts/restore.sh — restores a backup taken by backup.sh onto a running
# (empty) stack. Usage: ./scripts/restore.sh <backup-date, e.g. 2026-09-13>
set -euo pipefail

BACKUP_DATE="${1:?Usage: restore.sh <backup-date>}"
BACKUP_DIR="${BACKUP_HOST_PATH:-./backups}/$BACKUP_DATE"

[ -f "$BACKUP_DIR/db.sql.gz" ] || { echo "No backup found at $BACKUP_DIR" >&2; exit 1; }

gunzip -c "$BACKUP_DIR/db.sql.gz" | docker compose exec -T postgres psql -U "${POSTGRES_USER:-aegis}" "${POSTGRES_DB:-aegis}"

mc mirror --overwrite "$BACKUP_DIR/objects/" "aegis-minio/${S3_BUCKET_NAME:-aegis-evidence-prod}"

docker compose exec -T app pnpm db:verify

echo "Restore complete from $BACKUP_DIR"
```

- [x] **Step 3: Restore drill script**

```bash
#!/usr/bin/env bash
# scripts/drills/restore-drill.sh — takes a backup from the E2E database,
# restores it on the install-drill VM, verifies row counts (spec §10).
set -euo pipefail

VM_NAME="${1:?Usage: restore-drill.sh <drill-vm-name-from-install-drill>}"

# 1. Snapshot row counts from the E2E database before backup.
BEFORE_COUNT=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-aegis}" -tAc "SELECT count(*) FROM \"Observation\"")

./scripts/backup.sh

multipass transfer -r "${BACKUP_HOST_PATH:-./backups}" "$VM_NAME":/home/ubuntu/aegis/backups
multipass exec "$VM_NAME" -- bash -c "cd aegis && ./scripts/restore.sh $(date +%Y-%m-%d)"

AFTER_COUNT=$(multipass exec "$VM_NAME" -- bash -c "docker compose exec -T postgres psql -U \${POSTGRES_USER:-aegis} -tAc \"SELECT count(*) FROM \\\"Observation\\\"\"")

if [ "$BEFORE_COUNT" != "$AFTER_COUNT" ]; then
  echo "RESTORE DRILL FAILED: row count mismatch ($BEFORE_COUNT vs $AFTER_COUNT)" >&2
  exit 1
fi

echo "Restore drill passed ($AFTER_COUNT rows) on $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> docs/ops/restore-drill-log.md
```

The AWS target's restore drill (RDS PITR + S3 versioning per spec §8.5) is a separate, manual procedure — it cannot reuse this on-prem script's `pg_dump`/`mc mirror` mechanics, since AWS's backup story is the managed-service one, not a self-managed dump. Document its steps in Task 7's AWS checklist rather than scripting it here, since a script against a real AWS account is exactly the "no agent access to AWS" boundary this plan's Global Constraints draw.

- [ ] **Step 4: Run both drills together**

Run: `./scripts/drills/install-drill.sh` (produces `$VM_NAME`, but the script's own `trap cleanup EXIT` destroys the VM before this step could reuse it — restructure Task 5's script to optionally skip cleanup via a `--keep` flag when chained with the restore drill, or run the two as one combined drill script rather than two independent ones; resolve this sequencing gap in this task rather than shipping two scripts that can never actually run back-to-back as written).

- [ ] **Step 5: Commit**

```bash
git add scripts/backup.sh scripts/restore.sh scripts/drills/restore-drill.sh scripts/drills/install-drill.sh docs/ops/restore-drill-log.md
git commit -m "feat(ops): backup/restore scripts and the restore drill; both drills recorded per spec §10"
```

---

### Task 7: VPS checklist (replaces the AWS checklist — nc's direction, 2026-09-16)

**First customer targets our own VPS (vps-control, Hostinger + Tailscale,
`aegis.sapiex.tech`), not AWS.** The AWS path in spec §8.5/§10 stays
documented for a future AWS-hosted customer, but is not this program's
go-live target — written as `docs/ops/vps-checklist.md` instead.

**Files:**

- Create: `docs/ops/vps-checklist.md`

**Interfaces:** none — this is a document, run manually once before go-live per spec §10.

- [x] **Step 1: Write the checklist**

Written as `docs/ops/vps-checklist.md` — same shape as the AWS template
above would have been (DB, object store, networking/TLS, licensing,
restore drill, sign-off), adapted to vps-control's actual stack: no RDS/S3,
Postgres and MinIO run as containers with no public ports, Coolify's
existing Traefik does TLS instead of an ALB/Caddy, ufw + Tailscale ACLs
replace security groups. See that file for the actual checklist.

- [x] **Step 2: Commit**

```bash
git add docs/ops/vps-checklist.md
git commit -m "docs(ops): VPS go-live checklist, run manually once before go-live"
```

---

### Task 8: Onboarding runbook, run end to end

**Files:**

- Rewrite: `docs/ops/runbook.md`

**Interfaces:** none — this is a document, but it must be executed, not just written (spec §11 week 14 gate: "Runbook executed on a clean machine").

- [ ] **Step 1: Rewrite the runbook**

The current `docs/ops/runbook.md` opens with "There is nothing to operate... AEGIS has no deployed instance." That framing is only true until this plan's install/restore/board-report/E2E work lands — once it does, there is something to operate (the on-prem install path this plan built), even though there is still no live customer deployment. Rewrite the runbook to cover, in order:

1. Local dev setup (keep the existing section, it's still accurate).
2. **On-prem customer install** (new): `scripts/aegis-install.sh <license-file>`, what to check afterward (`/api/health`, `pnpm db:verify`), where logs live (`docker compose logs`).
3. **Backup and restore** (new): `scripts/backup.sh` on a cron, `scripts/restore.sh <date>` for recovery, pointing at the drill logs as evidence the procedure works.
4. **License renewal / rotation** (new): what happens at grace-period entry (a banner, per spec §8.3), how to install a renewed `license.aegis` without downtime.
5. **Health check and schema-drift caveat** (keep, still accurate per the existing text about `/api/health` not checking schema match).
6. Keep the honest "not deployed anywhere live" framing for anything that's still true — do not imply a production customer exists if none does.

- [ ] **Step 2: Execute the runbook on a clean machine**

This is the literal spec gate, not a formality: run `scripts/drills/install-drill.sh` (Task 5) fresh, and manually follow the runbook's backup/restore section against that same drill VM, timing how long each step takes and noting anywhere the written steps didn't match what actually happened. Fix the runbook text for any mismatch found — a runbook that doesn't match the real commands is worse than no runbook.

- [ ] **Step 3: Record the run**

Append the execution date, machine type (Multipass Ubuntu 22.04), and outcome to `docs/ops/install-drill-log.md` (reusing Task 5's log rather than creating a third log file for what is really the same drill run, just also serving as the runbook's own acceptance test).

- [ ] **Step 4: Commit**

```bash
git add docs/ops/runbook.md docs/ops/install-drill-log.md
git commit -m "docs(ops): rewrite runbook for the real install/backup/restore/license paths; executed on a clean machine"
```

---

### Task 9: Claims audit and the customer security statement

**Files:**

- Create: `docs/ops/security-statement.md`

**Interfaces:** none — a document, but Step 1's audit must trace each claim to real, currently-true evidence (a passing test, a piece of landed code) before it goes in the statement.

- [ ] **Step 1: Run the claims audit**

The spec (§11 week 14) calls for the security statement to be "rewritten from the claims audit" without defining what that audit is — this task defines it concretely: enumerate every security-relevant claim a bank's IT/compliance reviewer would ask about, and verify each one against the actual shipped system rather than against what was planned. For each claim below, cite the specific test or code that makes it true as of this task's run, or mark it not yet true and drop it from the statement:

- Tenant isolation: cite the RLS policies (tenant-isolation plan) and `src/data-access/__tests__/tenant-isolation.test.ts` + the cross-tenant integration tests (spec §10).
- Audit-chain tamper evidence: cite the chain-verification job and its integration test detecting a superuser edit/delete (audit-chain plan).
- Encryption at rest: cite what's actually true today — on-prem, this is a bank disk requirement the install checklist verifies, NOT something AEGIS itself provides; AWS, RDS/S3 defaults (spec §8.5). Do not overstate this as "AEGIS encrypts your data at rest" when the actual mechanism is the underlying infrastructure's responsibility.
- Backups: cite `scripts/backup.sh`/`restore.sh` and the restore-drill log (Task 6).
- Licensing/access control: cite the license verification boot check and its integration test refusing expired/wrong-host files (licensing plan).
- Authorization: cite the static authorization-gap test (Task 1).
- If the RLS spike (Plan 1's Task 2) ever failed and the application-level fallback (spec §4.3) is what's actually running: state that plainly, per spec §12's "documented in the ADR and the security statement" instruction — check Plan 1's ADR verdict before writing this section, since this plan cannot assume the spike passed.

- [ ] **Step 2: Write the statement**

```markdown
# AEGIS 2.0 — Security Statement

**As of:** <date this task runs>
**Deployment model:** on-premises (bank-hosted) or AWS (vendor-hosted), per contract.

## Tenant isolation

<filled from Step 1's audit — state the actual mechanism (RLS or the
application-level fallback), citing the ADR>

## Audit trail integrity

<filled from Step 1>

## Data at rest

<filled from Step 1 — explicit about what AEGIS provides vs. what the
hosting environment provides>

## Backups

<filled from Step 1, citing the drill logs with their actual dates>

## Licensing and access control

<filled from Step 1>

## Authorization

<filled from Step 1>

## What this statement does not cover

Field-level encryption, external anchoring of the audit chain, and formal
penetration testing are not part of this program (spec §13, after go-live).
Any claim beyond what is listed above should be treated as not yet true.
```

- [ ] **Step 3: Commit**

```bash
git add docs/ops/security-statement.md
git commit -m "docs(ops): customer security statement, rewritten from a claims audit against the shipped system"
```

---

### Task 10: Rewrite `docs/architecture.md`

**Files:**

- Rewrite: `docs/architecture.md`

**Interfaces:** none.

- [x] **Step 1: Diff old against new**

Read the current 616-line `docs/architecture.md` in full. Per `CLAUDE.md`: "it describes some things that are no longer here (i18n, Sentry, v5 sections)." Remove every passage describing next-intl, Sentry, and the v5 examination tables as if they're current. Add sections for: RLS-based tenant isolation (or the fallback, matching whatever the security statement says), the hash-chained audit log, the module-native framework (`AuditModule`/`ExaminationNode`/`ExaminationQuestion`/`EngagementModule`/`EngagementStatement`), the content-pack format and installer, the module admin page, the generic reporting engine, licensing and feature flags, and the on-prem/AWS deployment targets this plan built.

- [x] **Step 2: Cross-check against the spec, not against memory**

For each section rewritten, cite the specific spec section number it corresponds to (§4, §5, §6, §7, §8) so a future reader can trace architecture.md back to the design decision, the same way this plan's own research repeatedly needed to trace forward from the spec into the code.

- [x] **Step 3: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: rewrite architecture.md for the module-native, RLS-isolated, pack-based system this program built"
```

---

## Self-review

**Spec coverage (§9, §10, §11 weeks 12-14, §12's ADR/security-statement instruction):**

- §9's `generate-board-report` and authorization-gap items → Tasks 1-2.
- §10's static/integration/E2E/install-drill/load verification → Task 3 (E2E, the core-cycle and second-tenant tests), Tasks 5-6 (drills). Load (`the spike's autocannon script stays in scripts/ and runs before each release`) is not a new task in this plan — it already exists from Plan 1's Task 2 spike; this plan's only obligation regarding it is to confirm it's still referenced in the release checklist, which Task 8's runbook rewrite folds in as a line item rather than a separate task, since duplicating an already-built script would be needless.
- §11 week 12 (E2E, authorization gaps, board report) → Tasks 1-3. Week 13 (on-prem compose, installer, install drill, restore drill, AWS checklist) → Tasks 4-7. Week 14 (runbook run end to end, security statement, architecture.md, buffer) → Tasks 8-10. No week's gate is left uncovered.
- §12's "documented in the ADR and the security statement" for a failed spike → Task 9 Step 1 explicitly checks Plan 1's ADR verdict before writing, rather than assuming success.

**Placeholder scan:** Task 3's `core-cycle.spec.ts` code block contains real `// ...` placeholders — flagged explicitly, twice, as not acceptable to ship, with the task's own completion criteria requiring they be replaced with real selectors traced from a running dev server. This is the one place in this plan where a placeholder appears in a code block on purpose, and it is treated as a known risk below, not swept under the rug.

**Type consistency:** `processGenerateBoardReport`'s payload shape matches what `src/jobs/index.ts`'s `boss.work` handler passes as `job.data`. `BoardReport` field names in Task 2's test are flagged as needing confirmation against the real schema rather than assumed.

**Known risks to watch:**

- Task 3's core-cycle E2E test is the single riskiest deliverable in this plan — it is also the one this plan's own research could trace least concretely, since it requires a live, fully-seeded dev environment to write real selectors against, which this planning pass did not have running. A fresh implementer must budget real time to run the dev server and read actual DOM before writing this test, not just adapt the skeleton given here.
- Task 5/6's drill-script sequencing gap (the install drill destroys its own VM before the restore drill could reuse it) is called out explicitly in Task 6 Step 4 as something this task must resolve, not a finished design.
- Every place this plan invents an exact function/env-var name from a dependency plan (`getObjectStore()`, `systemActor()`, `pnpm db:migrate`, the adapters' exact env var names) is flagged inline as needing confirmation against that plan's actually-landed code, since this plan was written before those six plans finished executing and cannot know their final shape with certainty.
- The AWS checklist (Task 7) and its restore-drill section are deliberately left as a human-run document, never a script, per this repo's standing "no agent access to AWS" rule — this is a correct scope boundary, not a gap, but worth restating so a future reader doesn't try to automate it.
