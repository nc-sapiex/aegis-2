import { describe, it, expect, beforeEach } from "vitest";
import { materializeEngagementStatements } from "@/data-access/engagement-statements";
import { computeAndApplyInstanceScores } from "@/data-access/instance-scoring";
import {
  resetDatabase,
  createTenant,
  createUser,
  fakeSession,
  integrationOwner,
  withFixtures,
} from "../../../tests/integration/harness";
import type { AuthSession } from "@/lib/auth";

describe("computeAndApplyInstanceScores snapshot questions", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("still counts a snapshotted question after the live row is turned off", async () => {
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["CAE"]);

    const seed = await withFixtures(async () => {
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
          city: "Pune",
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
      const creditModule = await integrationOwner.auditModule.create({
        data: {
          tenantId: tenant.id,
          code: "CRD-HLN",
          name: "Housing",
          domain: "CREDIT",
          kinds: ["POPULATION_SAMPLE"],
          applicability: {},
        },
        select: { id: true },
      });
      const moduleNode = await integrationOwner.examinationNode.create({
        data: {
          tenantId: tenant.id,
          moduleId: creditModule.id,
          code: "CRD-HLN",
          name: "Housing",
          path: "CRD-HLN",
          depth: 1,
          isLeaf: false,
          weight: 1,
          isActive: true,
        },
        select: { id: true },
      });
      const leaf = await integrationOwner.examinationNode.create({
        data: {
          tenantId: tenant.id,
          moduleId: creditModule.id,
          code: "CRD-HLN-001",
          name: "Sanction",
          path: "CRD-HLN/CRD-HLN-001",
          depth: 2,
          isLeaf: true,
          parentId: moduleNode.id,
          weight: 1,
          isActive: true,
        },
        select: { id: true },
      });
      await integrationOwner.engagementModule.create({
        data: {
          tenantId: tenant.id,
          engagementId: engagement.id,
          moduleId: creditModule.id,
        },
      });
      const record = await integrationOwner.populationRecord.create({
        data: {
          tenantId: tenant.id,
          engagementId: engagement.id,
          moduleId: creditModule.id,
          branchId: branch.id,
          recordKey: "LN-001",
          displayName: "Borrower",
          amount: 1_000_000,
          date: new Date("2025-01-15"),
          classification: "STANDARD",
          isSampled: true,
        },
        select: { id: true },
      });
      const compliant = await integrationOwner.examinationQuestion.create({
        data: {
          tenantId: tenant.id,
          moduleId: creditModule.id,
          text: "Is the sanction complete?",
          weight: 1,
        },
        select: { id: true },
      });
      const violating = await integrationOwner.examinationQuestion.create({
        data: {
          tenantId: tenant.id,
          moduleId: creditModule.id,
          text: "Is valuation independent?",
          weight: 1,
        },
        select: { id: true },
      });
      await integrationOwner.accountExamResponse.create({
        data: {
          tenantId: tenant.id,
          engagementId: engagement.id,
          recordId: record.id,
          questionId: compliant.id,
          status: "COMPLIANT",
          isNotApplicable: false,
          respondedById: auditor.id,
        },
      });
      await integrationOwner.accountExamResponse.create({
        data: {
          tenantId: tenant.id,
          engagementId: engagement.id,
          recordId: record.id,
          questionId: violating.id,
          status: "VIOLATION",
          isNotApplicable: false,
          respondedById: auditor.id,
        },
      });
      return {
        engagementId: engagement.id,
        leafId: leaf.id,
        violatingId: violating.id,
      };
    });

    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );
    await withFixtures(() =>
      integrationOwner.examinationQuestion.update({
        where: { id: seed.violatingId },
        data: { isActive: false },
      }),
    );

    const session = fakeSession({
      id: auditor.id,
      tenantId: tenant.id,
      roles: ["CAE"],
    }) as AuthSession;
    const applied = await computeAndApplyInstanceScores(
      session,
      seed.engagementId,
      "CRD-HLN",
    );
    expect(applied.scoredLeafCount).toBe(1);

    const leaf = await integrationOwner.examinationResponse.findUniqueOrThrow({
      where: {
        engagementId_nodeId: {
          engagementId: seed.engagementId,
          nodeId: seed.leafId,
        },
      },
      select: { scoreLabel: true },
    });
    expect(leaf.scoreLabel).toBe("PARTIALLY_COMPLIANT");
  });
});
