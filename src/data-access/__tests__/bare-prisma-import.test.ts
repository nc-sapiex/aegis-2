/**
 * Only these files may import the bare `prisma` singleton. Everything else
 * reads through prismaForTenant(tenantId) or writes through withAuditedMutation.
 * Shrink-only: adding a path here needs a reviewer to say why RLS should not
 * apply to that file.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

const BARE_IMPORT_ALLOWLIST = new Set<string>([
  "src/lib/prisma.ts", // defines the singleton and prismaForTenant
  "src/lib/tenant-client.ts", // builds the tenant-scoped extended client
  "src/data-access/prisma.ts", // re-exports prisma/prismaForTenant for the DAL
  "src/data-access/audited-mutation.ts", // sets audit context on the shared client before writes
  "src/data-access/session.ts", // resolves the session before a tenantId exists
  "src/lib/auth.ts", // Better Auth adapter runs pre-tenant
  "src/lib/auth-lockout-plugin.ts", // Better Auth plugin runs on sign-in before a tenantId exists; FailedLoginAttempt has no tenantId column
  "src/data-access/compliance-management.ts", // reads global RBI reference tables (RbiMasterDirection/RbiChecklistItem/RbiCircular) with no tenantId column; tenant-scoped calls already use prismaForTenant
  "src/actions/user-invitations.ts", // acceptInvitation looks up User by the globally-unique email before a tenantId is known, same shape as sign-in
  "src/jobs/deadline-reminder.ts", // lists tenants, then calls prismaForTenant per tenant
  "src/jobs/weekly-digest.ts", // lists tenants, then calls prismaForTenant per tenant
  "src/jobs/snapshot-metrics.ts", // lists tenants, then calls prismaForTenant per tenant
  "src/jobs/overdue-escalation.ts", // lists tenants, then calls prismaForTenant per tenant
  "src/jobs/rbia-overdue-escalation.ts", // lists tenants, then calls prismaForTenant per tenant
  "src/jobs/compliance-escalation.ts", // lists tenants, then calls prismaForTenant per tenant
  "tests/integration/harness.ts", // test harness needs the raw client to set up fixtures
]);

const ROOTS = ["src/app", "src/actions", "src/data-access", "src/jobs", "src/lib", "src/components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "__integration__" || entry === "generated") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const BARE_IMPORT = /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["'](@\/lib\/prisma|@\/data-access\/prisma|\.\/prisma)["']/;

describe("bare prisma singleton imports", () => {
  it("appear only in the allowlist", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(process.cwd(), root))) {
        const rel = relative(process.cwd(), file);
        if (BARE_IMPORT_ALLOWLIST.has(rel)) continue;
        const src = readFileSync(file, "utf8");
        if (BARE_IMPORT.test(src)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("allowlist entries all exist (shrink when a file is deleted)", () => {
    for (const rel of BARE_IMPORT_ALLOWLIST) {
      expect(() => statSync(join(process.cwd(), rel))).not.toThrow();
    }
  });
});
