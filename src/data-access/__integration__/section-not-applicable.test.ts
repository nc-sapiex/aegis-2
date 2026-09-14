import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetDatabase,
  createTenant,
  createUser,
  fakeSession,
  mockSessionModule,
  integrationOwner,
  withFixtures,
} from "../../../tests/integration/harness";

describe("setSectionNotApplicable", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("clears the section scores and returns how many rows were cleared", async () => {
    const tenant = await createTenant("SectionNa Bank");
    const cae = await createUser(tenant.id, ["CAE"]);

    const seeded = await withFixtures(async () => {
      const plan = await integrationOwner.auditPlan.create({
        data: {
          tenantId: tenant.id,
          year: 2026,
          quarter: "Q1_APR_JUN",
          status: "PLANNED",
        },
        select: { id: true },
      });
      const branch = await integrationOwner.branch.create({
        data: {
          tenantId: tenant.id,
          code: "BR-001",
          name: "Main",
          city: "Mumbai",
          state: "MH",
        },
        select: { id: true },
      });
      const engagement = await integrationOwner.auditEngagement.create({
        data: {
          tenantId: tenant.id,
          auditPlanId: plan.id,
          branchId: branch.id,
          status: "IN_PROGRESS",
        },
        select: { id: true },
      });
      const root = await integrationOwner.examinationNode.create({
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
      const moduleNode = await integrationOwner.examinationNode.create({
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
      const node = await integrationOwner.examinationNode.create({
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
      const unansweredNode = await integrationOwner.examinationNode.create({
        data: {
          tenantId: tenant.id,
          code: "GOV-02",
          name: "Q2",
          path: "ROOT/GOV/GOV-02",
          depth: 2,
          parentId: moduleNode.id,
          isLeaf: true,
          weight: 1,
        },
        select: { id: true },
      });
      await integrationOwner.examinationResponse.create({
        data: {
          tenantId: tenant.id,
          engagementId: engagement.id,
          nodeId: node.id,
          score: 1,
          scoreLabel: "FULLY_COMPLIANT",
        },
      });
      return {
        engagementId: engagement.id,
        moduleId: moduleNode.id,
        nodeId: node.id,
        unansweredNodeId: unansweredNode.id,
      };
    });

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { setSectionNotApplicable } =
      await import("@/actions/rbia/section-not-applicable");

    const result = await setSectionNotApplicable({
      engagementId: seeded.engagementId,
      moduleId: seeded.moduleId,
      reason: "Branch has no govt business",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clearedCount).toBe(1);
    }

    const response = await integrationOwner.examinationResponse.findUnique({
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

  it("creates and marks unanswered leaves as not applicable", async () => {
    const tenant = await createTenant("SectionNa Bank");
    const cae = await createUser(tenant.id, ["CAE"]);

    const seeded = await withFixtures(async () => {
      const plan = await integrationOwner.auditPlan.create({
        data: {
          tenantId: tenant.id,
          year: 2026,
          quarter: "Q1_APR_JUN",
          status: "PLANNED",
        },
        select: { id: true },
      });
      const branch = await integrationOwner.branch.create({
        data: {
          tenantId: tenant.id,
          code: "BR-001",
          name: "Main",
          city: "Mumbai",
          state: "MH",
        },
        select: { id: true },
      });
      const engagement = await integrationOwner.auditEngagement.create({
        data: {
          tenantId: tenant.id,
          auditPlanId: plan.id,
          branchId: branch.id,
          status: "IN_PROGRESS",
        },
        select: { id: true },
      });
      const root = await integrationOwner.examinationNode.create({
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
      const moduleNode = await integrationOwner.examinationNode.create({
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
      const answeredNode = await integrationOwner.examinationNode.create({
        data: {
          tenantId: tenant.id,
          code: "GOV-01",
          name: "Q1",
          path: "ROOT/GOV/GOV-01",
          depth: 2,
          parentId: moduleNode.id,
          isLeaf: true,
          weight: 1,
        },
        select: { id: true },
      });
      const unansweredNode = await integrationOwner.examinationNode.create({
        data: {
          tenantId: tenant.id,
          code: "GOV-02",
          name: "Q2",
          path: "ROOT/GOV/GOV-02",
          depth: 2,
          parentId: moduleNode.id,
          isLeaf: true,
          weight: 1,
        },
        select: { id: true },
      });

      await integrationOwner.examinationResponse.create({
        data: {
          tenantId: tenant.id,
          engagementId: engagement.id,
          nodeId: answeredNode.id,
          score: 1,
          scoreLabel: "FULLY_COMPLIANT",
        },
      });
      return {
        engagementId: engagement.id,
        moduleId: moduleNode.id,
        unansweredNodeId: unansweredNode.id,
      };
    });

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { setSectionNotApplicable } =
      await import("@/actions/rbia/section-not-applicable");

    const result = await setSectionNotApplicable({
      engagementId: seeded.engagementId,
      moduleId: seeded.moduleId,
      reason: "Branch has no govt business",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.clearedCount).toBe(1);

    const unanswered = await integrationOwner.examinationResponse.findUnique({
      where: {
        engagementId_nodeId: {
          engagementId: seeded.engagementId,
          nodeId: seeded.unansweredNodeId,
        },
      },
      select: { isNotApplicable: true, notApplicableReason: true },
    });
    expect(unanswered?.isNotApplicable).toBe(true);
    expect(unanswered?.notApplicableReason).toBe("Branch has no govt business");
  });
});
