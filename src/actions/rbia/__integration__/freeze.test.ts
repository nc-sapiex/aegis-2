import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetDatabase,
  createTenant,
  createUser,
  fakeSession,
  mockSessionModule,
  integrationOwner,
  withFixtures,
} from "../../../../tests/integration/harness";

/**
 * One module, two leaves, plus a second module that is NOT selected for this
 * engagement. The unselected module exists to prove the freeze scopes to
 * EngagementModule rather than the whole tenant catalogue.
 */
async function seedExamination(tenantId: string, userId: string) {
  return withFixtures(async () => {
    const plan = await integrationOwner.auditPlan.create({
      data: { tenantId, year: 2026, quarter: "Q1_APR_JUN", status: "PLANNED" },
      select: { id: true },
    });
    const opsModule = await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "OPS",
        name: "OPS",
        domain: "OTHER",
        kinds: ["CHECKLIST"],
        applicability: {},
      },
      select: { id: true },
    });
    const branch = await integrationOwner.branch.create({
      data: {
        tenantId,
        code: "BR-001",
        name: "Main",
        city: "Pune",
        state: "MH",
      },
      select: { id: true },
    });
    const engagement = await integrationOwner.auditEngagement.create({
      data: {
        tenantId,
        auditPlanId: plan.id,
        branchId: branch.id,
        auditNumber: "RBIA/2026-27/BR-001/V1",
        periodFrom: new Date("2026-04-01"),
        periodTo: new Date("2026-06-30"),
        status: "IN_PROGRESS",
      },
      select: { id: true },
    });

    const node = (
      code: string,
      path: string,
      depth: number,
      isLeaf: boolean,
      parentId: string | null,
      moduleId: string | null = null,
    ) =>
      integrationOwner.examinationNode.create({
        data: {
          tenantId,
          code,
          name: code,
          path,
          depth,
          isLeaf,
          parentId,
          moduleId,
          weight: 1,
          isActive: true,
        },
        select: { id: true, code: true },
      });

    const root = await node("ROOT", "ROOT", 0, false, null);
    const ops = await node("OPS", "ROOT/OPS", 1, false, root.id, opsModule.id);
    const opsA = await node(
      "OPS-001",
      "ROOT/OPS/OPS-001",
      2,
      true,
      ops.id,
      opsModule.id,
    );
    const opsB = await node(
      "OPS-002",
      "ROOT/OPS/OPS-002",
      2,
      true,
      ops.id,
      opsModule.id,
    );
    const credit = await node("CREDIT", "ROOT/CREDIT", 1, false, root.id);
    const creditLeaf = await node(
      "CREDIT-001",
      "ROOT/CREDIT/CREDIT-001",
      2,
      true,
      credit.id,
    );

    // Only OPS is in scope for this engagement.
    await integrationOwner.engagementModule.create({
      data: { tenantId, engagementId: engagement.id, moduleId: opsModule.id },
    });

    return {
      engagementId: engagement.id,
      branchId: branch.id,
      ops,
      opsA,
      opsB,
      credit,
      creditLeaf,
      userId,
    };
  });
}

async function score(
  tenantId: string,
  engagementId: string,
  nodeId: string,
  label: "FULLY_COMPLIANT" | null,
  notApplicable = false,
) {
  // ExaminationResponse now carries an audit trigger, so this fixture write
  // must suspend it — the row is a precondition, not the audited action under
  // test (freezeRbiaScore is).
  await withFixtures(() =>
    integrationOwner.examinationResponse.create({
      data: {
        tenantId,
        engagementId,
        nodeId,
        score: label ? 1.0 : null,
        scoreLabel: label,
        isNotApplicable: notApplicable,
      },
    }),
  );
}

describe("freezeRbiaScore completeness", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("refuses to freeze while a selected leaf is unscored", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await score(tenant.id, seed.engagementId, seed.opsA.id, "FULLY_COMPLIANT");

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    const result = await freezeRbiaScore({ engagementId: seed.engagementId });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("INCOMPLETE_EXAMINATION");
      expect(result.error).toContain("OPS-002");
    }

    const frozen = await integrationOwner.branchRbiaScore.count({
      where: { engagementId: seed.engagementId },
    });
    expect(frozen).toBe(0);
  });

  it("freezes once every selected leaf is scored or marked not applicable", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await score(tenant.id, seed.engagementId, seed.opsA.id, "FULLY_COMPLIANT");
    await score(tenant.id, seed.engagementId, seed.opsB.id, null, true);

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    const result = await freezeRbiaScore({ engagementId: seed.engagementId });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.compositeScore).toBe(1);
  });

  it("does not require leaves of modules outside the engagement's selection", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await score(tenant.id, seed.engagementId, seed.opsA.id, "FULLY_COMPLIANT");
    await score(tenant.id, seed.engagementId, seed.opsB.id, "FULLY_COMPLIANT");

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    // CREDIT-001 is unscored, but CREDIT is not selected for this engagement.
    const result = await freezeRbiaScore({ engagementId: seed.engagementId });
    expect(result.success).toBe(true);

    const snapshot = await integrationOwner.branchRbiaScore.findUniqueOrThrow({
      where: { engagementId: seed.engagementId },
      select: { moduleScores: true },
    });
    expect(Object.keys(snapshot.moduleScores as object)).toEqual(["OPS"]);
  });

  it("refuses an engagement with no module selection", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await withFixtures(() =>
      integrationOwner.engagementModule.deleteMany({
        where: { engagementId: seed.engagementId },
      }),
    );

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    const result = await freezeRbiaScore({ engagementId: seed.engagementId });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("INCOMPLETE_EXAMINATION");
  });

  it("freezes when a selected credit module is fully examined as N/A", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await score(tenant.id, seed.engagementId, seed.opsA.id, "FULLY_COMPLIANT");
    await score(tenant.id, seed.engagementId, seed.opsB.id, "FULLY_COMPLIANT");

    await withFixtures(async () => {
      await integrationOwner.engagementModuleSelection.create({
        data: {
          tenantId: tenant.id,
          engagementId: seed.engagementId,
          moduleNodeId: seed.credit.id,
        },
      });
      const account = await integrationOwner.loanAccount.create({
        data: {
          tenantId: tenant.id,
          engagementId: seed.engagementId,
          branchId: seed.branchId,
          moduleCode: "CREDIT",
          accountNo: "LN-NA-001",
          borrowerName: "N/A Borrower",
          productType: "Housing Loan",
          sanctionAmount: 1_000_000,
          sanctionDate: new Date("2025-01-15"),
          outstandingAmount: 750_000,
          assetClass: "STANDARD",
          isSampled: true,
        },
        select: { id: true },
      });
      const question = await integrationOwner.examinationQuestion.create({
        data: {
          tenantId: tenant.id,
          moduleCode: "CREDIT",
          text: "Does this product feature apply?",
        },
        select: { id: true },
      });
      await integrationOwner.accountExamResponse.create({
        data: {
          tenantId: tenant.id,
          engagementId: seed.engagementId,
          loanAccountId: account.id,
          questionId: question.id,
          status: null,
          isNotApplicable: true,
          respondedById: cae.id,
        },
      });
    });

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    const result = await freezeRbiaScore({ engagementId: seed.engagementId });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.compositeScore).toBe(1);

    const creditResponse =
      await integrationOwner.examinationResponse.findUniqueOrThrow({
        where: {
          engagementId_nodeId: {
            engagementId: seed.engagementId,
            nodeId: seed.creditLeaf.id,
          },
        },
        select: { isNotApplicable: true, scoreLabel: true },
      });
    expect(creditResponse.isNotApplicable).toBe(true);
    expect(creditResponse.scoreLabel).toBeNull();
  });
});
