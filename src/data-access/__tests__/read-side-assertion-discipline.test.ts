/**
 * DAL read-side runtime assertion — static analysis.
 *
 * The 5-step DAL pattern (src/data-access/README.md) documents a step-4
 * runtime assertion — "throw if a returned row's tenantId doesn't match" —
 * as required going forward. It exists in only 2 of 52 modules today
 * (settings.ts, audit-trail.ts). Retrofitting all 46 remaining modules at
 * once is out of scope here; this test instead stops the gap from growing:
 * a *new* DAL module that reads tenant data must carry the assertion from
 * day one.
 *
 * RUNTIME_ASSERTION_ALLOWLIST is a literal snapshot of the modules exempt
 * as of this test's introduction — not a live re-scan (a re-scan of "lacks
 * the pattern" would be tautological with the enforcement condition itself).
 * The list may only ever SHRINK as modules migrate; do not add to it.
 *
 * Same technique as tenant-isolation.test.ts and
 * audited-mutation-discipline.test.ts: read the source, no database.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const DAL_ROOT = "src/data-access";

/** Modules exempt from the step-4 assertion as of 2026-09-26. Shrink only. */
const RUNTIME_ASSERTION_ALLOWLIST = new Set<string>([
  "src/data-access/access-guards.ts",
  "src/data-access/account-examination.ts",
  "src/data-access/analytics.ts",
  "src/data-access/audit-chain-admin.ts",
  "src/data-access/audit-execution.ts",
  "src/data-access/audit-modules.ts",
  "src/data-access/audit-plans.ts",
  "src/data-access/audit-teams.ts",
  "src/data-access/auditee.ts",
  "src/data-access/bh-certificate.ts",
  "src/data-access/cash-verification.ts",
  "src/data-access/compliance-items.ts",
  "src/data-access/compliance-management.ts",
  "src/data-access/compliance.ts",
  "src/data-access/dashboard.ts",
  "src/data-access/engagement-readiness.ts",
  "src/data-access/engagement-statements.ts",
  "src/data-access/engagement-visits.ts",
  "src/data-access/examination-questions.ts",
  "src/data-access/exports.ts",
  "src/data-access/instance-scoring.ts",
  "src/data-access/loan-account.ts",
  "src/data-access/module-admin.ts",
  "src/data-access/notifications.ts",
  "src/data-access/observations.ts",
  "src/data-access/onboarding.ts",
  "src/data-access/pack-catalog.ts",
  "src/data-access/pack-install.ts",
  "src/data-access/pre-audit-profiling.ts",
  "src/data-access/ram.ts",
  "src/data-access/rbia-analytics.ts",
  "src/data-access/rbia-bm-response.ts",
  "src/data-access/rbia-examination.ts",
  "src/data-access/rbia-findings.ts",
  "src/data-access/rbia-meetings.ts",
  "src/data-access/rbia-report.ts",
  "src/data-access/rbia-responses.ts",
  "src/data-access/rbia-scoring.ts",
  "src/data-access/reports.ts",
  "src/data-access/sampling.ts",
  "src/data-access/session.ts",
  "src/data-access/tenant-refs.ts",
  "src/data-access/upload-intents.ts",
  "src/data-access/user-invitations.ts",
  "src/data-access/users.ts",
  "src/data-access/zones.ts",
]);

const READ_VERB =
  /\.(findMany|findFirst|findUnique|count|aggregate|groupBy)\s*\(/;
const ASSERTION_MARKER = "Data isolation violation detected";

function topLevelDalFiles(): string[] {
  return readdirSync(join(process.cwd(), DAL_ROOT))
    .filter((entry) => {
      const abs = join(process.cwd(), DAL_ROOT, entry);
      return entry.endsWith(".ts") && statSync(abs).isFile();
    })
    .map((entry) => join(DAL_ROOT, entry));
}

describe("DAL read-side assertion discipline", () => {
  const files = topLevelDalFiles();

  it("finds source to analyse", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it("requires the step-4 assertion on every module not on the shrink-only allowlist", () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (RUNTIME_ASSERTION_ALLOWLIST.has(file)) continue;

      const source = readFileSync(join(process.cwd(), file), "utf-8");
      if (!READ_VERB.test(source)) continue; // no tenant-scoped read here

      if (!source.includes(ASSERTION_MARKER)) {
        offenders.push(file);
      }
    }

    expect(
      offenders,
      `New DAL modules with a tenant-scoped read but no step-4 assertion:
${offenders.join("\n")}

Add: if (result.tenantId !== tenantId) throw new Error("${ASSERTION_MARKER}");
See src/data-access/settings.ts for the canonical example.`,
    ).toEqual([]);
  });

  it("keeps the allowlist shrinking, never growing", () => {
    expect(RUNTIME_ASSERTION_ALLOWLIST.size).toBeLessThanOrEqual(46);
  });
});
