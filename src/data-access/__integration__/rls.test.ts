import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { RLS_TABLES } from "../../../prisma/sql/manifest";
import { createTenantClient } from "@/lib/tenant-client";
import { prisma } from "@/lib/prisma";
import {
  getAuditPlanProgress,
  getBranchRiskHeatmap,
  getComplianceAging,
  getFindingTrends,
  getReportTemplates,
} from "@/data-access/analytics";
import {
  getAuditActionTypes,
  getAuditTableNames,
} from "@/data-access/audit-trail";
import {
  createTenant,
  createUser,
  integrationOwner,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantA = (await createTenant("Tenant A")).id;
    tenantB = (await createTenant("Tenant B")).id;
    await createUser(tenantA, ["CAE"]);
    await createUser(tenantB, ["CAE"]);
    await integrationOwner.branch.create({
      data: {
        tenantId: tenantA,
        name: "A Branch",
        code: "A001",
        city: "Mumbai",
        state: "Maharashtra",
      },
    });
    await integrationOwner.branch.create({
      data: {
        tenantId: tenantB,
        name: "B Branch",
        code: "B001",
        city: "Bengaluru",
        state: "Karnataka",
      },
    });
  });
});

afterAll(async () => {
  await integrationOwner.$disconnect();
});

describe("RLS as aegis_app", () => {
  it("connects as aegis_app, not a superuser", async () => {
    const [row] = await prisma.$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean; usr: string }[]
    >`
      SELECT current_user AS usr, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(row.usr).toBe("aegis_app");
    expect(row.rolsuper).toBe(false);
    expect(row.rolbypassrls).toBe(false);
  });

  it.each([...RLS_TABLES])(
    "%s: tenant A sees none of tenant B's rows",
    async (table) => {
      const a = createTenantClient(prisma, tenantA);
      const rows = await a.$queryRaw<{ n: bigint }[]>(
        Prisma.sql`SELECT count(*)::bigint AS n FROM ${Prisma.raw(`"${table}"`)} WHERE "tenantId" = ${tenantB}::uuid`,
      );
      expect(Number(rows[0].n)).toBe(0);
    },
  );

  it.each([...RLS_TABLES])("%s: no GUC means no rows", async (table) => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>(
      Prisma.sql`SELECT count(*)::bigint AS n FROM ${Prisma.raw(`"${table}"`)}`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it("a write without the GUC is rejected by the policy", async () => {
    await expect(
      prisma.branch.create({
        data: {
          tenantId: tenantA,
          name: "Sneaky",
          code: "X999",
          city: "Mumbai",
          state: "Maharashtra",
        },
      }),
    ).rejects.toThrow(/row-level security policy/);
  });

  it("a write with the wrong GUC is rejected by the policy", async () => {
    const b = createTenantClient(prisma, tenantB);
    await expect(
      b.branch.create({
        data: {
          tenantId: tenantA,
          name: "Sneaky",
          code: "X998",
          city: "Mumbai",
          state: "Maharashtra",
        },
      }),
    ).rejects.toThrow(/row-level security policy/);
  });

  it("a write with the matching GUC succeeds and is visible only to that tenant", async () => {
    const a = createTenantClient(prisma, tenantA);
    const created = await a.branch.create({
      data: {
        tenantId: tenantA,
        name: "A2",
        code: "A002",
        city: "Mumbai",
        state: "Maharashtra",
      },
    });
    const fromB = await createTenantClient(prisma, tenantB).branch.findUnique({
      where: { id: created.id },
    });
    expect(fromB).toBeNull();
    const fromA = await a.branch.findUnique({ where: { id: created.id } });
    expect(fromA?.code).toBe("A002");
  });
});

const DAL_LIST_FUNCTIONS: Array<
  [string, (tenantId: string) => Promise<unknown>]
> = [
  ["getBranchRiskHeatmap", getBranchRiskHeatmap],
  ["getAuditPlanProgress", getAuditPlanProgress],
  ["getComplianceAging", getComplianceAging],
  ["getFindingTrends", getFindingTrends],
  ["getReportTemplates", getReportTemplates],
  ["getAuditTableNames", getAuditTableNames],
  ["getAuditActionTypes", getAuditActionTypes],
];

function countRows(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((n, v) => n + countRows(v), 0);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (n, v) => n + countRows(v),
      0,
    );
  }
  return typeof value === "number" ? value : 0;
}

describe("DAL list functions through prismaForTenant", () => {
  it.each(DAL_LIST_FUNCTIONS)(
    "%s returns nothing of tenant A when called for tenant B",
    async (_name, fn) => {
      const forB = await fn(tenantB);
      // Tenant B has one branch and no other data; anything else would be A's.
      expect(countRows(forB)).toBeLessThanOrEqual(1);
    },
  );
});
