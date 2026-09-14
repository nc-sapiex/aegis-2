import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { SQL_MANIFEST, REQUIRED_OBJECTS } from "../../../prisma/sql/manifest";
import { AUDITED_TABLES } from "../audit-triggers";

describe("SQL manifest", () => {
  it("lists files that all exist", () => {
    const missing = SQL_MANIFEST.filter(
      (p) => !existsSync(join(process.cwd(), p)),
    );
    expect(missing).toEqual([]);
  });

  it("applies the audit trigger function before attaching triggers", () => {
    const fn = SQL_MANIFEST.findIndex((p) =>
      p.includes("audit_trigger_null_safe"),
    );
    const attach = SQL_MANIFEST.findIndex((p) =>
      p.includes("attach_audit_triggers"),
    );
    expect(fn).toBeGreaterThanOrEqual(0);
    expect(attach).toBeGreaterThan(fn);
  });

  /**
   * Three places name the audited tables, and all three must agree:
   *
   *   AUDITED_TABLES            the discipline test reads it
   *   020_attach_audit_triggers what db:bootstrap actually applies
   *   REQUIRED_OBJECTS.triggers what db:verify asserts landed
   *
   * A table in the first but not the second is the dangerous case: the
   * discipline test lets an unwrapped write through as "audited", and the
   * database has no trigger to reject it. It passes CI and fails in production.
   * This asserted a hardcoded 14 while AUDITED_TABLES held 16, which is how
   * NotificationPreference and BoardReport drifted apart unnoticed.
   */
  it("names the same audited tables as AUDITED_TABLES and the attach script", () => {
    const sql = readFileSync(
      join(process.cwd(), "prisma/sql/020_attach_audit_triggers.sql"),
      "utf8",
    );
    const arrayBlock = sql.slice(
      sql.indexOf("audited TEXT[] := ARRAY["),
      sql.indexOf("];"),
    );
    const inSql = [...arrayBlock.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);

    const sorted = (xs: readonly string[]) => [...xs].sort();
    expect(sorted(inSql)).toEqual(sorted(AUDITED_TABLES));
    expect(sorted(REQUIRED_OBJECTS.triggers)).toEqual(sorted(AUDITED_TABLES));
  });

  it("names no superseded file", () => {
    const superseded = SQL_MANIFEST.filter((p) => p.includes("superseded"));
    expect(superseded).toEqual([]);
  });
});

import { RLS_TABLES } from "../../../prisma/sql/manifest";

const REFERENCE_TABLES = new Set([
  "RbiCircular",
  "RbiMasterDirection",
  "RbiChecklistItem",
]);

describe("RLS policies", () => {
  const schema = readFileSync(
    join(process.cwd(), "prisma/schema.prisma"),
    "utf8",
  );
  const policySql = readFileSync(
    join(process.cwd(), "prisma/sql/070_rls_policies.sql"),
    "utf8",
  );

  function tenantModels(): string[] {
    const out: string[] = [];
    const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(schema))) {
      const body = m[2];
      if (/^\s*tenantId\s+String/m.test(body) && !REFERENCE_TABLES.has(m[1]))
        out.push(m[1]);
    }
    return out.sort();
  }

  it("every tenant-scoped model has a policy and appears in RLS_TABLES", () => {
    const expected = tenantModels();
    expect(expected.length).toBeGreaterThan(50);
    expect([...RLS_TABLES].sort()).toEqual(expected);
    for (const table of expected) {
      expect(policySql).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`,
      );
      expect(policySql).toContain(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`,
      );
      expect(policySql).toContain(
        `CREATE POLICY tenant_isolation ON "${table}"`,
      );
    }
  });

  it("reference tables carry no policy", () => {
    for (const t of REFERENCE_TABLES)
      expect(policySql).not.toContain(`ON "${t}"`);
  });

  it("the policy file is in the manifest after the composite FK file", () => {
    const i = SQL_MANIFEST.indexOf("prisma/sql/070_rls_policies.sql");
    const j = SQL_MANIFEST.indexOf("prisma/sql/060_tenant_composite_fks.sql");
    expect(i).toBeGreaterThan(j);
  });
});
