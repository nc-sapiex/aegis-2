import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthSession } from "@/lib/auth";
import { getAuditReportData } from "../reports";
import {
  createTenant,
  createUser,
  fakeSession,
  integrationPrisma,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

describe("getAuditReportData, module-native", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await integrationPrisma.$disconnect();
  });

  it("includes engagement modules and their statements instead of v5 examination areas", async () => {
    const tenant = await createTenant("Report Bank");
    const user = await createUser(tenant.id, ["CAE"]);

    const engagement = await withFixtures(async () => {
      const plan = await integrationPrisma.auditPlan.create({
        data: { tenantId: tenant.id, year: 2026, quarter: "Q1_APR_JUN" },
        select: { id: true },
      });
      const branch = await integrationPrisma.branch.create({
        data: {
          tenantId: tenant.id,
          code: "RPT01",
          name: "Report Branch",
          city: "Pune",
          state: "MH",
        },
        select: { id: true },
      });
      const engagement = await integrationPrisma.auditEngagement.create({
        data: {
          tenantId: tenant.id,
          auditPlanId: plan.id,
          branchId: branch.id,
          status: "COMPLETED",
        },
        select: { id: true },
      });

      const root = await integrationPrisma.examinationNode.create({
        data: {
          tenantId: tenant.id,
          code: "ROOT",
          name: "Root",
          path: "ROOT",
          depth: 0,
          isLeaf: false,
          weight: 1,
        },
        select: { id: true },
      });
      const moduleNode = await integrationPrisma.examinationNode.create({
        data: {
          tenantId: tenant.id,
          code: "CRD",
          name: "Credit",
          path: "ROOT/CRD",
          depth: 1,
          isLeaf: false,
          parentId: root.id,
          weight: 1,
        },
        select: { id: true },
      });
      const statementNode = await integrationPrisma.examinationNode.create({
        data: {
          tenantId: tenant.id,
          code: "CRD-01",
          name: "Loan File Complete",
          path: "ROOT/CRD/CRD-01",
          depth: 2,
          isLeaf: true,
          parentId: moduleNode.id,
          weight: 1,
          isCritical: false,
          description: "Loan file complete",
        },
        select: { id: true },
      });

      await integrationPrisma.engagementModuleSelection.create({
        data: {
          tenantId: tenant.id,
          engagementId: engagement.id,
          moduleNodeId: moduleNode.id,
          isAutoSelected: true,
        },
      });
      await integrationPrisma.examinationResponse.create({
        data: {
          tenantId: tenant.id,
          engagementId: engagement.id,
          nodeId: statementNode.id,
          scoreLabel: "FULLY_COMPLIANT",
          score: 1,
          respondedById: user.id,
        },
      });

      return engagement;
    });

    const session = fakeSession({
      id: user.id,
      tenantId: tenant.id,
      roles: ["CAE"],
    }) as unknown as AuthSession;

    const data = await getAuditReportData(session, engagement.id);

    expect(data).not.toBeNull();
    expect(data?.modules).toHaveLength(1);
    expect(data?.modules[0].code).toBe("CRD");
    expect(data?.modules[0].statements).toHaveLength(1);
    expect(data?.modules[0].statements[0]).toMatchObject({
      code: "CRD-01",
      text: "Loan file complete",
    });
    expect(data?.modules[0].responses).toHaveLength(1);
    expect(data?.modules[0].responses[0]).toMatchObject({
      scoreLabel: "FULLY_COMPLIANT",
      nodeId: data?.modules[0].statements[0].id,
    });
  });

  it("assigns nested statements and account responses to the most specific selected module", async () => {
    const tenant = await createTenant("Specificity Bank");
    const user = await createUser(tenant.id, ["CAE"]);

    const engagement = await withFixtures(async () => {
      const plan = await integrationPrisma.auditPlan.create({
        data: { tenantId: tenant.id, year: 2026, quarter: "Q2_JUL_SEP" },
        select: { id: true },
      });
      const branch = await integrationPrisma.branch.create({
        data: {
          tenantId: tenant.id,
          code: "SPC01",
          name: "Specificity Branch",
          city: "Mumbai",
          state: "MH",
        },
        select: { id: true },
      });
      const engagement = await integrationPrisma.auditEngagement.create({
        data: {
          tenantId: tenant.id,
          auditPlanId: plan.id,
          branchId: branch.id,
          status: "COMPLETED",
        },
        select: { id: true },
      });

      const root = await integrationPrisma.examinationNode.create({
        data: {
          tenantId: tenant.id,
          code: "ROOT",
          name: "Root",
          path: "ROOT",
          depth: 0,
          isLeaf: false,
          weight: 1,
        },
        select: { id: true },
      });
      const credit = await integrationPrisma.examinationNode.create({
        data: {
          tenantId: tenant.id,
          code: "CRD",
          name: "Credit",
          path: "ROOT/CRD",
          depth: 1,
          isLeaf: false,
          parentId: root.id,
          weight: 1,
        },
        select: { id: true },
      });
      const housing = await integrationPrisma.examinationNode.create({
        data: {
          tenantId: tenant.id,
          code: "CRD-HLN",
          name: "Housing Loans",
          path: "ROOT/CRD/CRD-HLN",
          depth: 2,
          isLeaf: false,
          parentId: credit.id,
          weight: 1,
        },
        select: { id: true },
      });
      const statement = await integrationPrisma.examinationNode.create({
        data: {
          tenantId: tenant.id,
          code: "CRD-HLN-01",
          name: "Documentation complete",
          path: "ROOT/CRD/CRD-HLN/CRD-HLN-01",
          depth: 3,
          isLeaf: true,
          parentId: housing.id,
          weight: 1,
          description: "Housing loan documentation complete",
        },
        select: { id: true },
      });

      await integrationPrisma.engagementModuleSelection.createMany({
        data: [
          {
            tenantId: tenant.id,
            engagementId: engagement.id,
            moduleNodeId: credit.id,
            isAutoSelected: true,
          },
          {
            tenantId: tenant.id,
            engagementId: engagement.id,
            moduleNodeId: housing.id,
            isAutoSelected: true,
          },
        ],
      });
      await integrationPrisma.examinationResponse.create({
        data: {
          tenantId: tenant.id,
          engagementId: engagement.id,
          nodeId: statement.id,
          scoreLabel: "FULLY_COMPLIANT",
          score: 1,
          respondedById: user.id,
        },
      });

      const loanAccount = await integrationPrisma.loanAccount.create({
        data: {
          tenantId: tenant.id,
          engagementId: engagement.id,
          branchId: branch.id,
          moduleCode: "CRD-HLN",
          accountNo: "LN-SPEC-001",
          borrowerName: "Specificity Borrower",
          productType: "Housing Loan",
          sanctionAmount: 1_000_000,
          sanctionDate: new Date("2025-01-15"),
          outstandingAmount: 750_000,
          assetClass: "STANDARD",
          isSampled: true,
        },
        select: { id: true },
      });
      const question = await integrationPrisma.examinationQuestion.create({
        data: {
          tenantId: tenant.id,
          moduleCode: "CRD-HLN",
          text: "Was the housing loan sample examined?",
        },
        select: { id: true },
      });
      await integrationPrisma.accountExamResponse.create({
        data: {
          tenantId: tenant.id,
          engagementId: engagement.id,
          loanAccountId: loanAccount.id,
          questionId: question.id,
          status: "COMPLIANT",
          respondedById: user.id,
        },
      });

      return engagement;
    });

    const session = fakeSession({
      id: user.id,
      tenantId: tenant.id,
      roles: ["CAE"],
    }) as unknown as AuthSession;

    const data = await getAuditReportData(session, engagement.id);

    const creditModule = data?.modules.find((module) => module.code === "CRD");
    const housingModule = data?.modules.find(
      (module) => module.code === "CRD-HLN",
    );

    expect(creditModule?.statements).toHaveLength(0);
    expect(creditModule?.accountExamResponses).toHaveLength(0);
    expect(housingModule?.statements).toHaveLength(1);
    expect(housingModule?.responses).toHaveLength(1);
    expect(housingModule?.accountExamResponses).toHaveLength(1);
    expect(housingModule?.accountExamResponses[0]).toMatchObject({
      status: "COMPLIANT",
      question: { moduleCode: "CRD-HLN" },
      loanAccount: { moduleCode: "CRD-HLN" },
    });
  });
});
