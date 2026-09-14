import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  materializeEngagementStatements,
  getEngagementStatements,
} from "@/data-access/engagement-statements";
import {
  integrationPrisma,
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
    const branch = await integrationPrisma.branch.create({
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
    const auditModule = await integrationPrisma.auditModule.create({
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
    const node = await integrationPrisma.examinationNode.create({
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
    const auditPlan = await integrationPrisma.auditPlan.create({
      data: { tenantId, year: 2026, quarter: "Q1_APR_JUN" },
    });
    const engagement = await integrationPrisma.auditEngagement.create({
      data: {
        tenantId,
        auditPlanId: auditPlan.id,
        branchId: branch.id,
        status: "PLANNED",
      },
    });
    engagementId = engagement.id;
    await integrationPrisma.engagementModule.create({
      data: { tenantId, engagementId, moduleId, isAutoSelected: true },
    });
  });
});

afterAll(async () => integrationPrisma.$disconnect());

describe("materializeEngagementStatements", () => {
  it("snapshots every node of every selected module into EngagementStatement", async () => {
    await materializeEngagementStatements(
      integrationPrisma as never,
      engagementId,
      tenantId,
    );
    const statements = await getEngagementStatements(tenantId, engagementId);
    expect(statements).toHaveLength(1);
    expect(statements[0].nodeId).toBe(nodeId);
    expect(statements[0].text).toBe("Loan file is complete");
  });

  it("a later edit to the bank statement does not change the snapshot", async () => {
    await integrationPrisma.examinationNode.update({
      where: { id: nodeId },
      data: { description: "Loan file is complete and signed" },
    });
    const statements = await getEngagementStatements(tenantId, engagementId);
    expect(statements[0].text).toBe("Loan file is complete");
  });
});
