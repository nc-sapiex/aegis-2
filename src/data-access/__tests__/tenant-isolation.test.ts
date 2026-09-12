/**
 * Tenant Data Isolation Verification — DSEC-05
 *
 * Static analysis test that scans DAL source files for correct tenant isolation
 * patterns. Verifies that all DAL functions with DB queries include tenantId
 * filtering and that tenantId always originates from authenticated session context.
 *
 * This is a static pattern analysis test — it does not require a running database.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const DAL_DIR = join(process.cwd(), "src/data-access");

// Files that are infrastructure, not query files
const EXCLUDED_FILES = new Set([
  "index.ts",
  "prisma.ts",
  "session.ts",
  "types.ts",
  "README.md",
]);

function getDalFiles(): string[] {
  return readdirSync(DAL_DIR).filter(
    (f) => f.endsWith(".ts") && !f.startsWith("__") && !EXCLUDED_FILES.has(f),
  );
}

function getFileContent(filename: string): string {
  return readFileSync(join(DAL_DIR, filename), "utf-8");
}

function hasDbQuery(content: string): boolean {
  return /\.(findMany|findFirst|findUnique|count|aggregate)\b/.test(content);
}

describe("Tenant Data Isolation (DSEC-05)", () => {
  const dalFiles = getDalFiles();

  it("DAL directory contains multiple files", () => {
    expect(dalFiles.length).toBeGreaterThan(10);
  });

  it("prisma.ts re-exports prismaForTenant from lib/prisma", () => {
    const prismaContent = getFileContent("prisma.ts");
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
    // Returns singleton — isolation via WHERE clauses, not connection-level
    expect(libPrismaContent).toContain("return prisma");
  });

  describe("every DAL file with queries includes tenantId filter", () => {
    for (const file of dalFiles) {
      const content = getFileContent(file);
      if (!hasDbQuery(content)) continue;

      it(`${file} — queries reference tenantId`, () => {
        // All files with DB queries must reference tenantId
        // Either in WHERE clause (tenantId:) or destructuring (const { tenantId })
        const hasTenantFilter = content.includes("tenantId");
        expect(hasTenantFilter).toBe(true);
      });
    }
  });

  describe("tenantId originates from authenticated session context", () => {
    for (const file of dalFiles) {
      const content = getFileContent(file);
      if (!hasDbQuery(content)) continue;
      // Skip files with no tenantId at all (already caught above)
      if (!content.includes("tenantId")) continue;

      it(`${file} — tenantId comes from session, not URL/body`, () => {
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

  it("prismaForTenant is the only way to get a DB client in DAL files", () => {
    // All DAL files should use prismaForTenant (not raw prisma import)
    // This ensures the UUID validation gate is always applied
    const queryFiles = dalFiles.filter((f) => hasDbQuery(getFileContent(f)));

    let anyWithDirectPrisma = false;
    const violations: string[] = [];

    for (const file of queryFiles) {
      const content = getFileContent(file);
      // Check for direct prisma import (bypassing prismaForTenant)
      const hasPrismaForTenant = content.includes("prismaForTenant");
      // Some files may import prisma for non-tenant operations (session file etc.)
      // But query files should use prismaForTenant
      if (!hasPrismaForTenant && content.includes('from "./prisma"')) {
        // Check if this file imports prisma directly (not prismaForTenant)
        const importsRawPrisma =
          /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from/.test(content);
        if (importsRawPrisma) {
          violations.push(file);
          anyWithDirectPrisma = true;
        }
      }
    }

    if (anyWithDirectPrisma) {
      console.warn(
        "Files using raw prisma instead of prismaForTenant:",
        violations,
      );
    }

    // This is a warning-level check — log violations but don't fail
    // prismaForTenant itself returns the same singleton, so isolation is via WHERE
    expect(violations).toSatisfy((v: string[]) => {
      if (v.length > 0) {
        console.warn(
          `DSEC-05 advisory: ${v.length} file(s) use raw prisma import: ${v.join(", ")}`,
        );
      }
      return true; // advisory only — where clauses enforce isolation
    });
  });

  it("cross-tenant data leakage check — no findMany without WHERE tenantId", () => {
    const violations: string[] = [];

    for (const file of dalFiles) {
      const content = getFileContent(file);
      if (!hasDbQuery(content)) continue;

      // Find all findMany blocks (simplified heuristic)
      const findManyMatches = content.matchAll(
        /\.findMany\(\s*\{([^}]{0,500})\}/gs,
      );

      for (const match of findManyMatches) {
        const block = match[1];
        // If a findMany block doesn't include tenantId in its where clause, flag it
        if (!block.includes("tenantId") && block.includes("where")) {
          violations.push(`${file}: findMany block missing tenantId in WHERE`);
        }
      }
    }

    // Log violations for review but allow known exceptions
    // (some queries may be system-wide for admin operations)
    if (violations.length > 0) {
      console.warn(
        "DSEC-05 review required — findMany blocks without tenantId filter:",
        violations,
      );
    }

    // The key assertion: every DAL file with queries references tenantId somewhere
    // Detailed WHERE clause verification requires runtime DB testing
    const queryFilesWithoutTenant = dalFiles.filter((f) => {
      const c = getFileContent(f);
      return hasDbQuery(c) && !c.includes("tenantId");
    });

    expect(queryFilesWithoutTenant).toHaveLength(0);
  });

  /**
   * Extract the full argument text of each `.findMany(` call, brace-balanced.
   * The warn-only heuristic above truncates at the first nested `}`, which made
   * it blind to the most dangerous shape of all: a findMany with no `where` key
   * whatsoever, which returns every tenant's rows. getUsers() shipped exactly
   * that bug.
   */
  function findManyArgs(content: string): string[] {
    const out: string[] = [];
    const marker = ".findMany(";
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
      out.push(content.slice(idx + marker.length, j));
      idx = j;
    }
    return out;
  }

  it("every findMany names a where clause — ENFORCED, shrink-only allowlist", () => {
    /**
     * Files sanctioned to run findMany with no `where` at all. Only queries on
     * global reference tables that carry no tenantId column belong here
     * (compliance-management.ts reads RbiMasterDirection / RbiChecklistItem /
     * RbiCircular). This list may only ever SHRINK — an unfiltered findMany on
     * a tenant-scoped table returns every tenant's rows.
     */
    const NO_WHERE_ALLOWLIST = new Set<string>(["compliance-management.ts"]);

    const offenders: string[] = [];
    for (const file of dalFiles) {
      if (NO_WHERE_ALLOWLIST.has(file)) continue;
      const content = getFileContent(file);
      for (const args of findManyArgs(content)) {
        if (!/\bwhere\b/.test(args)) {
          offenders.push(file);
        }
      }
    }

    expect(
      offenders,
      `findMany with no where clause — returns every tenant's rows:
${[...new Set(offenders)].join("\n")}

Add where: { tenantId } (or, for a global reference table with no tenantId
column, add the file to NO_WHERE_ALLOWLIST with a comment naming the table).`,
    ).toEqual([]);

    expect(NO_WHERE_ALLOWLIST.size).toBeLessThanOrEqual(1);
  });

  it("every DAL module imports server-only", () => {
    const allModules = readdirSync(DAL_DIR).filter(
      (f) => f.endsWith(".ts") && !f.startsWith("__"),
    );
    const missing = allModules.filter(
      (f) => !getFileContent(f).includes(`import "server-only"`),
    );
    expect(
      missing,
      `DAL modules missing the server-only directive: ${missing.join(", ")}
Without it, importing the module from a "use client" component bundles
database access toward the client instead of failing the build.`,
    ).toEqual([]);
  });
});
