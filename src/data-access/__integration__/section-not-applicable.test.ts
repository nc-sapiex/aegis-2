import { describe, it, expect, beforeEach } from "vitest";
import { setSectionNotApplicable } from "@/actions/rbia/section-not-applicable";
import {
  resetDatabase,
  createTenant,
  createUser,
  integrationPrisma,
  withFixtures,
} from "../../../tests/integration/harness";

describe("setSectionNotApplicable", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("clears the section scores and returns how many rows were cleared", async () => {
    const tenant = await createTenant("SectionNa Bank");
    const cae = await createUser(tenant.id, ["CAE"]);

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
          status: "IN_PROGRESS",
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
          code: "GOV",
          name: "Govt Business",
          path: "ROOT/GOV",
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
          code: "GOV-01",
          name: "Q",
          path: "ROOT/GOV/GOV-01",
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
        },
      });
      return { engagementId: engagement.id, moduleId: moduleNode.id, nodeId: node.id };
    });

    const result = await setSectionNotApplicable({
      tenantId: tenant.id,
      userId: cae.id,
      engagementId: seeded.engagementId,
      moduleId: seeded.moduleId,
      reason: "Branch has no govt business",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clearedCount).toBe(1);
    }

    const response = await integrationPrisma.examinationResponse.findUnique({
      where: {
        engagementId_nodeId: {
          engagementId: seeded.engagementId,
          nodeId: seeded.nodeId,
        },
      },
      select: { scoreLabel: true },
    });
    expect(response?.scoreLabel).toBeNull();
  });
});
