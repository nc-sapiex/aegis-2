import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  materializeEngagementStatements,
  getEngagementStatements,
  getModuleRailData,
  getModuleRegister,
} from "@/data-access/engagement-statements";
import {
  integrationOwner,
  createTenant,
  createUser,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

let tenantId: string;
let moduleId: string;
let nodeId: string;
let engagementId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Snapshot Bank")).id;
    await createUser(tenantId, ["CAE"]);
    const branch = await integrationOwner.branch.create({
      data: {
        tenantId,
        name: "Test Branch",
        code: "T001",
        city: "Mumbai",
        state: "Maharashtra",
        hasForex: true,
        loanProducts: [],
      },
    });
    const auditModule = await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "CRD",
        name: "Credit",
        domain: "CREDIT",
        kinds: ["CHECKLIST"],
        applicability: {},
      },
    });
    moduleId = auditModule.id;
    const node = await integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId,
        code: "CRD-01",
        name: "Documentation",
        path: "CRD/CRD-01",
        depth: 1,
        isLeaf: true,
        weight: 1,
        isCritical: false,
        description: "Loan file is complete",
      },
    });
    nodeId = node.id;
    const auditPlan = await integrationOwner.auditPlan.create({
      data: { tenantId, year: 2026, quarter: "Q1_APR_JUN" },
    });
    const engagement = await integrationOwner.auditEngagement.create({
      data: {
        tenantId,
        auditPlanId: auditPlan.id,
        branchId: branch.id,
        status: "PLANNED",
      },
    });
    engagementId = engagement.id;
    await integrationOwner.engagementModule.create({
      data: { tenantId, engagementId, moduleId, isAutoSelected: true },
    });
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("materializeEngagementStatements", () => {
  it("snapshots every node of every selected module into EngagementStatement", async () => {
    await materializeEngagementStatements(
      integrationOwner as never,
      engagementId,
      tenantId,
    );
    const statements = await getEngagementStatements(tenantId, engagementId);
    expect(statements).toHaveLength(1);
    expect(statements[0].nodeId).toBe(nodeId);
    expect(statements[0].text).toBe("Loan file is complete");
  });

  it("a later edit to the bank statement does not change the snapshot", async () => {
    await integrationOwner.examinationNode.update({
      where: { id: nodeId },
      data: { description: "Loan file is complete and signed" },
    });
    const statements = await getEngagementStatements(tenantId, engagementId);
    expect(statements[0].text).toBe("Loan file is complete");
  });
});

describe("getModuleRailData", () => {
  it("groups a bank-authored (no pack) CHECKLIST module under CORE", async () => {
    const rail = await getModuleRailData(tenantId, engagementId);
    expect(rail).toHaveLength(1);
    expect(rail[0]).toMatchObject({
      code: "CRD",
      group: "CORE",
      scored: 0,
      total: 1,
      score: null,
    });
  });

  it("counts a scored response toward scored and score", async () => {
    await withFixtures(() =>
      integrationOwner.examinationResponse.create({
        data: {
          tenantId,
          engagementId,
          nodeId,
          score: 1,
          scoreLabel: "FULLY_COMPLIANT",
        },
      }),
    );
    const rail = await getModuleRailData(tenantId, engagementId);
    expect(rail[0]).toMatchObject({ scored: 1, total: 1, score: 1 });
  });
});

describe("getModuleRegister", () => {
  it("still lists a snapshotted statement after the catalogue row is turned off", async () => {
    await withFixtures(() =>
      integrationOwner.examinationNode.update({
        where: { id: nodeId },
        data: { isActive: false },
      }),
    );
    const rows = await getModuleRegister(tenantId, engagementId, "CRD");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(nodeId);
    expect(rows[0].text).toBe("Loan file is complete");

    const rail = await getModuleRailData(tenantId, engagementId);
    expect(rail[0].total).toBe(1);
  });
});
