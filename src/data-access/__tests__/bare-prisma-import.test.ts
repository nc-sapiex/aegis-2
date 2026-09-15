/**
 * Only these files may import the bare `prisma` or `prismaSystem` clients.
 * Everything else reads through prismaForTenant(tenantId) or writes through
 * withAuditedMutation. Shrink-only: adding a path here needs a reviewer to
 * say why RLS should not apply to that file.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

const BARE_IMPORT_ALLOWLIST = new Set<string>([
  "src/lib/prisma.ts", // defines prisma, prismaSystem, prismaForTenant
  "src/lib/tenant-client.ts",
  "src/data-access/prisma.ts", // re-exports from lib/prisma
  "src/data-access/audited-mutation.ts", // owns transaction + GUC lifecycle
  "src/data-access/session.ts", // reads the user row that tenantId comes from
  "src/lib/auth.ts", // Better Auth adapter — pre-tenant
  "src/lib/auth-lockout-plugin.ts", // pre-tenant; FailedLoginAttempt has no tenantId column
  "src/data-access/compliance-management.ts", // reads only global RBI reference tables (no tenantId column)
  "src/data-access/notifications.ts", // cross-tenant job DAL — dynamic-imports prismaSystem/prismaForTenant per call site
  "src/actions/user-invitations.ts", // acceptInvitation's pre-auth token lookup
  "src/jobs/compliance-escalation.ts", // lists tenants before looping prismaForTenant
  "src/jobs/deadline-reminder.ts",
  "src/jobs/overdue-escalation.ts",
  "src/jobs/rbia-overdue-escalation.ts",
  "src/jobs/snapshot-metrics.ts",
  "src/jobs/verify-audit-chain.ts", // lists tenants before looping prismaForTenant
  "src/jobs/weekly-digest.ts",
  "tests/integration/harness.ts",
]);

const ROOTS = [
  "src/app",
  "src/actions",
  "src/data-access",
  "src/jobs",
  "src/lib",
  "src/components",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (
        entry === "__tests__" ||
        entry === "__integration__" ||
        entry === "generated"
      )
        continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// Matches both static `import { prisma } from "..."` and dynamic
// `const { prisma } = await import("...")`, for either bare client.
const NAMED_BLOCK =
  /\{([^}]*)\}\s*(?:from|=\s*await\s+import\()\s*["'](?:@\/lib\/prisma|@\/data-access\/prisma|\.\/prisma)["']/g;

function importsBareClient(src: string): boolean {
  NAMED_BLOCK.lastIndex = 0;
  let block: RegExpExecArray | null;
  while ((block = NAMED_BLOCK.exec(src))) {
    const names = block[1];
    if (/\bprisma\b/.test(names) || /\bprismaSystem\b/.test(names)) {
      return true;
    }
  }
  return false;
}

describe("bare prisma singleton imports", () => {
  it("appear only in the allowlist", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(process.cwd(), root))) {
        const rel = relative(process.cwd(), file);
        if (BARE_IMPORT_ALLOWLIST.has(rel)) continue;
        const src = readFileSync(file, "utf8");
        if (importsBareClient(src)) offenders.push(rel);
      }
    }
    expect(
      offenders,
      `Files importing the bare prisma/prismaSystem client outside the allowlist:
${offenders.join("\n")}

Use prismaForTenant(tenantId) instead, or add the file to
BARE_IMPORT_ALLOWLIST with a comment saying why RLS should not apply.`,
    ).toEqual([]);
  });

  it("allowlist entries all exist (shrink when a file is deleted)", () => {
    for (const rel of BARE_IMPORT_ALLOWLIST) {
      expect(() => statSync(join(process.cwd(), rel))).not.toThrow();
    }
  });
});
