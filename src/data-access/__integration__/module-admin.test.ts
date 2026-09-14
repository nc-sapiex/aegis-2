import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getModuleAdminView } from "@/data-access/module-admin";
import {
  integrationOwner,
  createTenant,
  createUser,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

let tenantId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Module Admin Bank")).id;
    await createUser(tenantId, ["CAE"]);
    // weight is Decimal(5,4) (schema.prisma) — max absolute value < 10, so
    // the brief's literal weights of 30/20 overflow that column. Scaled
    // down to 3/2 here; the 0.4 share assertion below is unaffected.
    await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "CRD",
        name: "Credit",
        domain: "CREDIT",
        kinds: ["CHECKLIST"],
        applicability: {},
        weight: 3,
        isActive: true,
      },
    });
    const bankModule = await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "OPS",
        name: "Operations",
        domain: "ADMIN",
        kinds: ["CHECKLIST"],
        applicability: {},
        weight: 2,
        isActive: true,
      },
    });
    await integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId: bankModule.id,
        code: "OPS-B01",
        name: "Local check",
        path: "OPS/OPS-B01",
        depth: 1,
        isLeaf: true,
        weight: 1,
        isCritical: false,
        description: "x",
        origin: "BANK",
      },
    });
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("getModuleAdminView", () => {
  it("lists every module with its share and statement counts", async () => {
    const rows = await getModuleAdminView(tenantId);
    expect(rows).toHaveLength(2);
    const ops = rows.find((r) => r.code === "OPS");
    expect(ops?.bankStatementCount).toBe(1);
    expect(ops?.share).toBeCloseTo(0.4); // 2 / (3+2)
  });
});
