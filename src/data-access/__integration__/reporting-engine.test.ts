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
});
