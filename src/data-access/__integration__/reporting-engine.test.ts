import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAuditReportData } from "@/data-access/reports";
import {
  integrationOwner,
  createTenant,
  createUser,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

let tenantId: string;
let engagementId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Report Bank")).id;
    const user = await createUser(tenantId, ["CAE"]);
    const branch = await integrationOwner.branch.create({
      data: {
        tenantId,
        name: "Report Branch",
        code: "RPT01",
        city: "Mumbai",
        state: "Maharashtra",
        loanProducts: [],
      },
    });
    const auditPlan = await integrationOwner.auditPlan.create({
      data: { tenantId, year: 2026, quarter: "Q1_APR_JUN" },
    });
    const engagement = await integrationOwner.auditEngagement.create({
      data: {
        tenantId,
        auditPlanId: auditPlan.id,
        branchId: branch.id,
        status: "COMPLETED",
      },
    });
    engagementId = engagement.id;
    const auditModule = await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "CRD",
        name: "Credit",
        domain: "CREDIT",
        kinds: ["CHECKLIST"],
        applicability: {},
        weight: 100,
      },
    });
    await integrationOwner.engagementModule.create({
      data: {
        tenantId,
        engagementId,
        moduleId: auditModule.id,
        isAutoSelected: true,
      },
    });
    const node = await integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId: auditModule.id,
        code: "CRD-01",
        name: "x",
        path: "CRD/CRD-01",
        depth: 1,
        isLeaf: true,
        weight: 1,
        isCritical: false,
        description: "Loan file complete",
        origin: "BANK",
      },
    });
    await integrationOwner.engagementStatement.create({
      data: {
        tenantId,
        engagementId,
        nodeId: node.id,
        text: "Loan file complete",
        weight: 1,
        isCritical: false,
        origin: "BANK",
      },
    });
    await integrationOwner.examinationResponse.create({
      data: {
        tenantId,
        engagementId,
        nodeId: node.id,
        scoreLabel: "FULLY_COMPLIANT",
        respondedById: user.id,
        respondedAt: new Date(),
      },
    } as never);
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("getAuditReportData, module-native", () => {
  it("includes engagement modules and their statements instead of v5 examination areas", async () => {
    const session = { user: { tenantId } } as never; // read the real AuthSession shape from data-access/session.ts if this fixture is insufficient
    const data = await getAuditReportData(session, engagementId);
    expect(data).not.toBeNull();
    expect(data?.modules).toHaveLength(1);
    expect(data?.modules[0].code).toBe("CRD");
    expect(data?.modules[0].statements).toHaveLength(1);
    expect(data?.modules[0].statements[0].scoreLabel).toBe("FULLY_COMPLIANT");
  });
});
