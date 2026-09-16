/**
 * Authorization-gap static test — spec §10.
 *
 * "hasPermission in every action; requirePermission in every dashboard page."
 * Static source scan, no database — same technique as
 * data-access/__tests__/tenant-isolation.test.ts and
 * audited-mutation-discipline.test.ts.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const GUARD_CALLS = [
  "requirePermission(",
  "requireAnyPermission(",
  "requireOnboardingPermission(",
];

/** Files intentionally exempt from a direct GUARD_CALLS match. Shrink-only. */
const PAGE_GUARD_ALLOWLIST = new Set<string>([
  // Enforces dashboard access via hasDashboardAccess()/postLoginHome() instead
  // of requireAnyPermission — a straight requireAnyPermission(DASHBOARD_PERMISSIONS)
  // would redirect an unauthorized user from /dashboard back to
  // /dashboard?unauthorized=true, which is ERR_TOO_MANY_REDIRECTS (see the
  // page's own comment). hasDashboardAccess/postLoginHome is the permission
  // check for this one page; it just isn't spelled requirePermission.
  "src/app/(dashboard)/dashboard/page.tsx",
]);

/** Server action files intentionally exempt from a direct hasPermission( match. Shrink-only. */
const ACTION_GUARD_ALLOWLIST = new Set<string>([
  // transitionReportStatus is gated by TRANSITION_ROLES (schemas.ts) — a
  // per-transition-edge role map — plus checkReportTransition's
  // maker-checker rule. No single Permission key maps onto "whichever
  // roles this specific edge names," and OR/AND-ing one in would either
  // widen who can transition a report or add a decorative check that
  // does nothing (both rejected on review, see task-1-report.md).
  "src/actions/reports/transition-report.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "__integration__") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

describe("authorization gaps", () => {
  it("every (dashboard) page.tsx calls a page guard", () => {
    const dashboardRoot = join(process.cwd(), "src/app/(dashboard)");
    const pages = walk(dashboardRoot).filter((f) => f.endsWith("page.tsx"));

    expect(pages.length).toBeGreaterThan(0);

    const unguarded = pages
      .filter((path) => {
        const rel = relative(process.cwd(), path);
        if (PAGE_GUARD_ALLOWLIST.has(rel)) return false;
        const content = readFileSync(path, "utf-8");
        return !GUARD_CALLS.some((call) => content.includes(call));
      })
      .map((path) => relative(process.cwd(), path));

    expect(
      unguarded,
      `Dashboard page(s) with no page guard call (${GUARD_CALLS.join(", ")}):\n${unguarded.join("\n")}`,
    ).toEqual([]);

    expect(PAGE_GUARD_ALLOWLIST.size).toBeLessThanOrEqual(1);
  });

  it("every server action file checks hasPermission", () => {
    const actionsRoot = join(process.cwd(), "src/actions");
    const actionFiles = walk(actionsRoot).filter(
      (f) =>
        f.endsWith(".ts") &&
        !f.endsWith(".test.ts") &&
        !f.endsWith("schemas.ts"),
    );

    expect(actionFiles.length).toBeGreaterThan(0);

    const unguarded = actionFiles
      .filter((path) => {
        const rel = relative(process.cwd(), path);
        if (ACTION_GUARD_ALLOWLIST.has(rel)) return false;
        const content = readFileSync(path, "utf-8");
        if (!/^["']use server["'];?$/m.test(content)) return false; // shared helper, not an action entry point
        return !content.includes("hasPermission(");
      })
      .map((path) => relative(process.cwd(), path));

    expect(
      unguarded,
      `Server action file(s) with "use server" but no hasPermission check:\n${unguarded.join("\n")}`,
    ).toEqual([]);

    expect(ACTION_GUARD_ALLOWLIST.size).toBeLessThanOrEqual(1);
  });
});
