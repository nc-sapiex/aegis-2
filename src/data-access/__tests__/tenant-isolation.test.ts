/**
 * Tenant Data Isolation Verification — DSEC-05
 *
 * Static analysis test that scans DAL and server action source files for
 * correct tenant isolation patterns. Verifies that all functions with DB
 * queries include tenantId filtering and that tenantId always originates
 * from authenticated session context.
 *
 * This is a static pattern analysis test — it does not require a running database.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const DAL_DIR = join(process.cwd(), "src/data-access");
const SCAN_ROOTS = ["src/data-access", "src/actions"];

// Files that are infrastructure, not query files
const EXCLUDED_FILES = new Set([
  "index.ts",
  "prisma.ts",
  "session.ts",
  "types.ts",
  "README.md",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "__integration__") continue;
      walk(full, out);
    } else if (entry.endsWith(".ts") && !EXCLUDED_FILES.has(entry))
      out.push(full);
  }
  return out;
}

const queryFiles = SCAN_ROOTS.flatMap((r) => walk(join(process.cwd(), r)));

function getFileContent(file: string): string {
  return readFileSync(file, "utf-8");
}

function hasDbQuery(content: string): boolean {
  return /\.(findMany|findFirst|findUnique|count|aggregate|groupBy)\b|\$queryRaw\b/.test(
    content,
  );
}

describe("Tenant Data Isolation (DSEC-05)", () => {
  const dbFiles = queryFiles.filter((f) => hasDbQuery(getFileContent(f)));

  it("scans a non-trivial number of DAL and action files", () => {
    expect(queryFiles.length).toBeGreaterThan(10);
  });

  it("prisma.ts re-exports prismaForTenant from lib/prisma", () => {
    const prismaContent = getFileContent(join(DAL_DIR, "prisma.ts"));
    // data-access/prisma.ts re-exports from @/lib/prisma
    expect(prismaContent).toContain("prismaForTenant");
    expect(prismaContent).toContain("server-only");
  });

  it("lib/prisma.ts implements prismaForTenant with UUID validation", () => {
    const libPrismaContent = readFileSync(
      join(process.cwd(), "src/lib/prisma.ts"),
      "utf-8",
    );
    // Function must exist
    expect(libPrismaContent).toContain("prismaForTenant");
    // UUID validation is a security requirement — prevents injection via invalid IDs
    expect(libPrismaContent).toContain("UUID_REGEX");
    // Returns the tenant-bound extended client, never the bare singleton
    expect(libPrismaContent).toContain("createTenantClient(prisma, tenantId)");
    expect(libPrismaContent).not.toMatch(/^\s*return prisma;\s*$/m);
  });

  describe("every file with queries references tenantId", () => {
    for (const file of dbFiles) {
      const rel = relative(process.cwd(), file);
      it(`${rel} — queries reference tenantId`, () => {
        // All files with DB queries must reference tenantId
        // Either in WHERE clause (tenantId:) or destructuring (const { tenantId })
        expect(getFileContent(file).includes("tenantId")).toBe(true);
      });
    }
  });

  describe("tenantId originates from authenticated session context", () => {
    for (const file of dbFiles) {
      const content = getFileContent(file);
      const rel = relative(process.cwd(), file);
      // Skip files with no tenantId at all (already caught above)
      if (!content.includes("tenantId")) continue;

      it(`${rel} — tenantId comes from session, not URL/body`, () => {
        // Valid patterns for tenant context:
        //   1. File accepts Session object: (session: Session) or (session: AuthSession)
        //   2. File accepts tenantId as typed string: (tenantId: string)
        //   3. File extracts from session inline: session.user.tenantId
        //   4. File calls getRequiredSession() internally
        const hasSessionParam =
          /\(session:\s*(Session|AuthSession)\b/.test(content) ||
          content.includes("session: Session");
        const hasTenantIdParam = /\btenantId:\s*string\b/.test(content);
        const hasSessionCall = content.includes("getRequiredSession");
        const hasSessionExtract = content.includes("session.user.tenantId");

        const hasSafeSource =
          hasSessionParam ||
          hasTenantIdParam ||
          hasSessionCall ||
          hasSessionExtract;

        expect(hasSafeSource).toBe(true);
      });
    }
  });

  /**
   * Extract the full argument text of each query call, brace-balanced. A
   * naive truncate-at-first-`}` heuristic is blind to the most dangerous
   * shape of all: a query with no `where` key whatsoever, which returns
   * every tenant's rows. getUsers() shipped exactly that bug.
   */
  function queryArgs(
    content: string,
    marker: string,
  ): { index: number; args: string }[] {
    const out: { index: number; args: string }[] = [];
    let idx = 0;
    while ((idx = content.indexOf(marker, idx)) !== -1) {
      let depth = 0;
      let j = idx + marker.length - 1; // the opening "("
      for (; j < content.length; j++) {
        const c = content[j];
        if (c === "(" || c === "{" || c === "[") depth++;
        else if (c === ")" || c === "}" || c === "]") {
          depth--;
          if (depth === 0) break;
        }
      }
      out.push({ index: idx, args: content.slice(idx + marker.length, j) });
      idx = j;
    }
    return out;
  }

  /**
   * Name of the nearest `function` declaration starting before `index`. Lets
   * an allowlist exempt one function's query instead of every query in its
   * file — a file-wide exemption also blinds the check to every other
   * function in that file, including ones this same test is supposed to
   * cover (a sibling function's tenantId fix can regress silently).
   */
  function enclosingFunctionName(
    content: string,
    index: number,
  ): string | undefined {
    const FUNCTION_START = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
    let name: string | undefined;
    let m: RegExpExecArray | null;
    while ((m = FUNCTION_START.exec(content))) {
      if (m.index > index) break;
      name = m[1];
    }
    return name;
  }

  const QUERY_MARKERS = [
    ".findMany(",
    ".findFirst(",
    ".count(",
    ".aggregate(",
    ".groupBy(",
  ];

  it("every findMany/findFirst/count/aggregate/groupBy names tenantId — ENFORCED, shrink-only allowlist", () => {
    /**
     * Files sanctioned to run these queries with no tenantId predicate at
     * all. Only reads of global reference tables that carry no tenantId
     * column belong here (compliance-management.ts reads
     * RbiMasterDirection / RbiChecklistItem / RbiCircular, none of which
     * have a tenantId column — see prisma/schema.prisma). This list may
     * only ever SHRINK — an unfiltered query on a tenant-scoped table
     * returns every tenant's rows.
     */
    const NO_TENANT_ALLOWLIST = new Set<string>(["compliance-management.ts"]);

    /**
     * Shrink-only, separate from NO_TENANT_ALLOWLIST: these tables do carry a
     * tenantId column, but one specific function's query is deliberately not
     * scoped by it — a pre-tenant lookup or a cross-tenant worker poll that
     * splits by tenantId immediately after. Keyed by `basename:functionName`
     * so the exemption covers only that function, not every query in the
     * file — a sibling function in the same file (e.g. claimNotifications
     * next to getPendingNotifications) stays fully checked.
     */
    const DELIBERATE_ALLOWLIST = new Set<string>([
      "user-invitations.ts:acceptInvitation", // resolves an invited User by globally-unique email before any tenantId is known — same shape as sign-in
      "notifications.ts:getPendingNotifications", // polls the global pg-boss queue across all tenants; claimNotifications (same file) splits the claim by tenantId immediately after, in the same worker tick, and stays checked
    ]);

    const offenders: string[] = [];
    for (const file of queryFiles) {
      const base = file.split("/").pop()!;
      if (NO_TENANT_ALLOWLIST.has(base)) continue;
      const content = getFileContent(file);
      for (const marker of QUERY_MARKERS) {
        for (const { index, args } of queryArgs(content, marker)) {
          if (/\btenantId\b/.test(args)) continue;
          const fn = enclosingFunctionName(content, index);
          if (fn && DELIBERATE_ALLOWLIST.has(`${base}:${fn}`)) continue;
          offenders.push(
            `${relative(process.cwd(), file)}: ${marker}${fn ? ` (in ${fn})` : ""}`,
          );
        }
      }
    }

    expect(
      offenders,
      `Query with no tenantId predicate — returns every tenant's rows:
${[...new Set(offenders)].join("\n")}

Add where: { tenantId } (or, for a global reference table with no tenantId
column, add the file's basename to NO_TENANT_ALLOWLIST with a comment naming
the table).`,
    ).toEqual([]);

    expect(NO_TENANT_ALLOWLIST.size).toBeLessThanOrEqual(1);
  });

  it("every $queryRaw/$queryRawUnsafe filters by tenantId", () => {
    const RAW_CALL = /\$queryRaw(?:Unsafe)?\s*(?:<[^>]*>)?\s*`([\s\S]*?)`/g;
    const rawOffenders: string[] = [];

    for (const file of queryFiles) {
      const content = getFileContent(file);
      let m: RegExpExecArray | null;
      RAW_CALL.lastIndex = 0;
      while ((m = RAW_CALL.exec(content))) {
        // Matches "tenantId" (quoted Prisma column) and "tenant_id" (raw SQL
        // view columns like v_compliance_summary), case-insensitively.
        if (!/tenant_?id/i.test(m[1])) {
          rawOffenders.push(
            `${relative(process.cwd(), file)}: ${m[1].trim().slice(0, 60)}`,
          );
        }
      }
    }

    expect(rawOffenders).toEqual([]);
  });

  it("every DAL module imports server-only", () => {
    const allModules = readdirSync(DAL_DIR).filter(
      (f) => f.endsWith(".ts") && !f.startsWith("__"),
    );
    const missing = allModules.filter(
      (f) =>
        !readFileSync(join(DAL_DIR, f), "utf-8").includes(
          `import "server-only"`,
        ),
    );
    expect(
      missing,
      `DAL modules missing the server-only directive: ${missing.join(", ")}
Without it, importing the module from a "use client" component bundles
database access toward the client instead of failing the build.`,
    ).toEqual([]);
  });
});
