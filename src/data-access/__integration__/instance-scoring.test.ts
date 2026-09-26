import { describe, it, expect, beforeEach } from "vitest";
import { materializeEngagementStatements } from "@/data-access/engagement-statements";
import {
  computeAndApplyInstanceScores,
  findIncompleteInstanceModuleCodes,
} from "@/data-access/instance-scoring";
import {
  resetDatabase,
  createTenant,
  createUser,
  fakeSession,
  integrationOwner,
  withFixtures,
} from "../../../tests/integration/harness";
import type { AuthSession } from "@/lib/auth";

async function seedSampledCreditEngagement(options: {
  tenantId: string;
  auditorId: string;
  answerSecondQuestion?: boolean;
}) {
  return withFixtures(async () => {
    const plan = await integrationOwner.auditPlan.create({
      data: {
        tenantId: options.tenantId,
        year: 2026,
        quarter: "Q1_APR_JUN",
        status: "PLANNED",
      },
      select: { id: true },
    });
    const branch = await integrationOwner.branch.create({
      data: {
        tenantId: options.tenantId,
        code: "BR-001",
        name: "Main",
        city: "Pune",
        state: "MH",
      },
      select: { id: true },
    });
    const engagement = await integrationOwner.auditEngagement.create({
      data: {
        tenantId: options.tenantId,
        auditPlanId: plan.id,
        branchId: branch.id,
        status: "IN_PROGRESS",
      },
      select: { id: true },
    });
    const creditModule = await integrationOwner.auditModule.create({
      data: {
        tenantId: options.tenantId,
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
        tenantId: options.tenantId,
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
        tenantId: options.tenantId,
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
        tenantId: options.tenantId,
        engagementId: engagement.id,
        moduleId: creditModule.id,
      },
    });
    const record = await integrationOwner.populationRecord.create({
      data: {
        tenantId: options.tenantId,
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
    const first = await integrationOwner.examinationQuestion.create({
      data: {
        tenantId: options.tenantId,
        moduleId: creditModule.id,
        text: "Is the sanction complete?",
        weight: 1,
      },
      select: { id: true },
    });
    const second = await integrationOwner.examinationQuestion.create({
      data: {
        tenantId: options.tenantId,
        moduleId: creditModule.id,
        text: "Is valuation independent?",
        weight: 1,
      },
      select: { id: true },
    });
    await integrationOwner.accountExamResponse.create({
      data: {
        tenantId: options.tenantId,
        engagementId: engagement.id,
        recordId: record.id,
        questionId: first.id,
        status: "COMPLIANT",
        isNotApplicable: false,
        respondedById: options.auditorId,
      },
    });
    if (options.answerSecondQuestion !== false) {
      await integrationOwner.accountExamResponse.create({
        data: {
          tenantId: options.tenantId,
          engagementId: engagement.id,
          recordId: record.id,
          questionId: second.id,
          status: "VIOLATION",
          isNotApplicable: false,
          respondedById: options.auditorId,
        },
      });
    }
    return {
      engagementId: engagement.id,
      leafId: leaf.id,
      firstId: first.id,
      secondId: second.id,
      moduleId: creditModule.id,
    };
  });
}

describe("computeAndApplyInstanceScores snapshot questions", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("still counts a snapshotted question after the live row is turned off", async () => {
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["CAE"]);
    const seed = await seedSampledCreditEngagement({
      tenantId: tenant.id,
      auditorId: auditor.id,
    });

    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );
    await withFixtures(() =>
      integrationOwner.examinationQuestion.update({
        where: { id: seed.secondId },
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

describe("findIncompleteInstanceModuleCodes snapshot questions", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("does not treat a question added after snapshot as unfinished work", async () => {
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["CAE"]);
    const seed = await seedSampledCreditEngagement({
      tenantId: tenant.id,
      auditorId: auditor.id,
    });

    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );
    await withFixtures(() =>
      integrationOwner.examinationQuestion.create({
        data: {
          tenantId: tenant.id,
          moduleId: seed.moduleId,
          text: "Was the CIBIL pull dated after sanction?",
          weight: 1,
        },
      }),
    );

    const session = fakeSession({
      id: auditor.id,
      tenantId: tenant.id,
      roles: ["CAE"],
    }) as AuthSession;
    // Live catalogue now has an unanswered question. The snapshot does not.
    await expect(
      findIncompleteInstanceModuleCodes(session, seed.engagementId),
    ).resolves.toEqual([]);
  });

  it("still treats a deactivated unanswered snapshotted question as incomplete", async () => {
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["CAE"]);
    const seed = await seedSampledCreditEngagement({
      tenantId: tenant.id,
      auditorId: auditor.id,
      answerSecondQuestion: false,
    });

    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );
    await withFixtures(() =>
      integrationOwner.examinationQuestion.update({
        where: { id: seed.secondId },
        data: { isActive: false },
      }),
    );

    const session = fakeSession({
      id: auditor.id,
      tenantId: tenant.id,
      roles: ["CAE"],
    }) as AuthSession;
    // Live catalogue would drop the unanswered question and call the
    // register complete. The snapshot still has it.
    await expect(
      findIncompleteInstanceModuleCodes(session, seed.engagementId),
    ).resolves.toEqual(["CRD-HLN"]);
  });
});
