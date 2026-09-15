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

describe("getAuditReportData, POPULATION_SAMPLE (question-backed) statements", () => {
  let sampleTenantId: string;
  let sampleEngagementId: string;

  beforeAll(async () => {
    await withFixtures(async () => {
      sampleTenantId = (await createTenant("Sample Report Bank")).id;
      const user = await createUser(sampleTenantId, ["CAE"]);
      const branch = await integrationOwner.branch.create({
        data: {
          tenantId: sampleTenantId,
          name: "Sample Branch",
          code: "SMP01",
          city: "Pune",
          state: "Maharashtra",
          loanProducts: [],
        },
      });
      const auditPlan = await integrationOwner.auditPlan.create({
        data: { tenantId: sampleTenantId, year: 2026, quarter: "Q1_APR_JUN" },
      });
      const engagement = await integrationOwner.auditEngagement.create({
        data: {
          tenantId: sampleTenantId,
          auditPlanId: auditPlan.id,
          branchId: branch.id,
          status: "COMPLETED",
        },
      });
      sampleEngagementId = engagement.id;
      const auditModule = await integrationOwner.auditModule.create({
        data: {
          tenantId: sampleTenantId,
          code: "LOAN",
          name: "Loan Portfolio",
          domain: "CREDIT",
          kinds: ["POPULATION_SAMPLE"],
          applicability: {},
          weight: 100,
        },
      });
      await integrationOwner.engagementModule.create({
        data: {
          tenantId: sampleTenantId,
          engagementId: sampleEngagementId,
          moduleId: auditModule.id,
          isAutoSelected: true,
        },
      });
      const question = await integrationOwner.examinationQuestion.create({
        data: {
          tenantId: sampleTenantId,
          moduleId: auditModule.id,
          text: "Is the account within sanctioned limit?",
        },
      });
      await integrationOwner.engagementStatement.create({
        data: {
          tenantId: sampleTenantId,
          engagementId: sampleEngagementId,
          questionId: question.id,
          text: "Is the account within sanctioned limit?",
          weight: 1,
          isCritical: false,
          origin: "BANK",
        },
      });
      const record = await integrationOwner.populationRecord.create({
        data: {
          tenantId: sampleTenantId,
          engagementId: sampleEngagementId,
          moduleId: auditModule.id,
          branchId: branch.id,
          recordKey: "ACC-001",
          displayName: "Test Borrower",
          amount: 100000,
          date: new Date(),
          classification: "STANDARD",
        },
      });
      await integrationOwner.accountExamResponse.create({
        data: {
          tenantId: sampleTenantId,
          engagementId: sampleEngagementId,
          recordId: record.id,
          questionId: question.id,
          status: "VIOLATION",
          respondedById: user.id,
        },
      });
    });
  });

  it("tallies AccountExamResponse into compliantCount/violationCount via computeModuleComplianceScores", async () => {
    const session = { user: { tenantId: sampleTenantId } } as never;
    const data = await getAuditReportData(session, sampleEngagementId);
    expect(data).not.toBeNull();
    expect(data?.modules).toHaveLength(1);
    expect(data?.modules[0].code).toBe("LOAN");
    const statement = data?.modules[0].statements[0];
    expect(statement?.compliantCount).toBe(0);
    expect(statement?.violationCount).toBe(1);
    expect(statement?.scoreLabel).toBe("NON_COMPLIANT");
  });
});
