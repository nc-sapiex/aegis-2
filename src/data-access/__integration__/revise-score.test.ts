import { describe, it, expect, beforeEach } from "vitest";
import { reviseScore } from "@/actions/rbia/revise-score";
import {
  resetDatabase,
  createTenant,
  createUser,
  integrationPrisma,
  withFixtures,
} from "../../../tests/integration/harness";

describe("reviseScore", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("changes the score and records a rbia.score_revised audit event", async () => {
    const tenant = await createTenant("Revise Bank");
    const lead = await createUser(tenant.id, ["LEAD_AUDITOR"]);

    const seeded = await withFixtures(async () => {
      const plan = await integrationPrisma.auditPlan.create({
        data: {
          tenantId: tenant.id,
          year: 2026,
          quarter: "Q1_APR_JUN",
          status: "PLANNED",
        },
        select: { id: true },
      });
      const branch = await integrationPrisma.branch.create({
        data: {
          tenantId: tenant.id,
          code: "BR-001",
          name: "Main",
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
          status: "REPORT_DRAFT",
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
          parentId: root.id,
          isLeaf: false,
          weight: 1,
        },
        select: { id: true },
      });
      const node = await integrationPrisma.examinationNode.create({
        data: {
          tenantId: tenant.id,
          code: "CRD-01",
          name: "Doc",
          path: "ROOT/CRD/CRD-01",
          depth: 2,
          parentId: moduleNode.id,
          isLeaf: true,
          weight: 1,
        },
        select: { id: true },
      });
      await integrationPrisma.examinationResponse.create({
        data: {
          tenantId: tenant.id,
          engagementId: engagement.id,
          nodeId: node.id,
          score: 1,
          scoreLabel: "FULLY_COMPLIANT",
          respondedById: lead.id,
        },
      });
      return { engagementId: engagement.id, nodeId: node.id };
    });

    const result = await reviseScore({
      tenantId: tenant.id,
      userId: lead.id,
      engagementId: seeded.engagementId,
      nodeId: seeded.nodeId,
      newScoreLabel: "PARTIALLY_COMPLIANT",
      reason: "Reviewer found missing document",
    });

    expect(result.success).toBe(true);

    const updated = await integrationPrisma.examinationResponse.findUnique({
      where: {
        engagementId_nodeId: {
          engagementId: seeded.engagementId,
          nodeId: seeded.nodeId,
        },
      },
      select: { scoreLabel: true },
    });
    expect(updated?.scoreLabel).toBe("PARTIALLY_COMPLIANT");

    const auditRows = await integrationPrisma.auditLog.findMany({
      where: { tenantId: tenant.id, actionType: "rbia.score_revised" },
      select: { id: true },
    });
    expect(auditRows).toHaveLength(1);
  });
});
