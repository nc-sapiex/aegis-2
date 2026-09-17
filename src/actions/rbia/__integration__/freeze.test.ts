import { describe, it, expect, beforeEach, vi } from "vitest";
import { materializeEngagementStatements } from "@/data-access/engagement-statements";
import { SCORE_VALUES } from "@/lib/rbia-scoring-engine";
import {
  addModuleSelection,
  autoSelectModules,
} from "@/data-access/rbia-examination";
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
    const creditModule = await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "CREDIT",
        name: "CREDIT",
        domain: "OTHER",
        kinds: ["CHECKLIST"],
        applicability: {},
      },
      select: { id: true },
    });
    const credit = await node(
      "CREDIT",
      "ROOT/CREDIT",
      1,
      false,
      root.id,
      creditModule.id,
    );
    const creditLeaf = await node(
      "CREDIT-001",
      "ROOT/CREDIT/CREDIT-001",
      2,
      true,
      credit.id,
      creditModule.id,
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
      creditModule,
      creditLeaf,
      userId,
    };
  });
}

async function score(
  tenantId: string,
  engagementId: string,
  nodeId: string,
  label: "FULLY_COMPLIANT" | "NON_COMPLIANT" | null,
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
        score: label ? SCORE_VALUES[label] : null,
        scoreLabel: label,
        isNotApplicable: notApplicable,
      },
    }),
  );
}

/** A bank statement added to OPS after the engagement's snapshot was taken. */
function addLateOpsLeaf(tenantId: string, opsNodeId: string) {
  return withFixtures(async () => {
    const opsNode = await integrationOwner.examinationNode.findUniqueOrThrow({
      where: { id: opsNodeId },
      select: { moduleId: true },
    });
    return integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId: opsNode.moduleId,
        code: "OPS-B01",
        name: "Late bank statement",
        path: "ROOT/OPS/OPS-B01",
        depth: 2,
        isLeaf: true,
        parentId: opsNodeId,
        weight: 1,
        isActive: true,
      },
      select: { id: true },
    });
  });
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
      await integrationOwner.engagementModule.create({
        data: {
          tenantId: tenant.id,
          engagementId: seed.engagementId,
          moduleId: seed.creditModule.id,
        },
      });
      const record = await integrationOwner.populationRecord.create({
        data: {
          tenantId: tenant.id,
          engagementId: seed.engagementId,
          moduleId: seed.creditModule.id,
          branchId: seed.branchId,
          recordKey: "LN-NA-001",
          displayName: "N/A Borrower",
          amount: 1_000_000,
          date: new Date("2025-01-15"),
          classification: "STANDARD",
          isSampled: true,
        },
        select: { id: true },
      });
      const question = await integrationOwner.examinationQuestion.create({
        data: {
          tenantId: tenant.id,
          moduleId: seed.creditModule.id,
          text: "Does this product feature apply?",
        },
        select: { id: true },
      });
      await integrationOwner.accountExamResponse.create({
        data: {
          tenantId: tenant.id,
          engagementId: seed.engagementId,
          recordId: record.id,
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

  it("does not require a live leaf added after the engagement snapshot", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );

    await addLateOpsLeaf(tenant.id, seed.ops.id);

    await score(tenant.id, seed.engagementId, seed.opsA.id, "FULLY_COMPLIANT");
    await score(tenant.id, seed.engagementId, seed.opsB.id, "FULLY_COMPLIANT");

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    const result = await freezeRbiaScore({ engagementId: seed.engagementId });
    expect(result.success).toBe(true);
  });

  it("still requires a snapshotted leaf after the catalogue row is turned off", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );
    await withFixtures(() =>
      integrationOwner.examinationNode.update({
        where: { id: seed.opsB.id },
        data: { isActive: false },
      }),
    );
    await score(tenant.id, seed.engagementId, seed.opsA.id, "FULLY_COMPLIANT");

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    const blocked = await freezeRbiaScore({ engagementId: seed.engagementId });
    expect(blocked.success).toBe(false);
    if (!blocked.success) {
      expect(blocked.code).toBe("INCOMPLETE_EXAMINATION");
      expect(blocked.error).toContain("OPS-002");
    }
  });

  it("snapshots only the added module's statements when a module is added after create", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );
    const late = await addLateOpsLeaf(tenant.id, seed.ops.id);

    await addModuleSelection(
      fakeSession({
        id: cae.id,
        tenantId: tenant.id,
        roles: ["CAE"],
      }) as never,
      seed.engagementId,
      seed.creditModule.id,
      "Branch also books gold loans",
    );

    const extra = await integrationOwner.engagementStatement.findFirst({
      where: { engagementId: seed.engagementId, nodeId: seed.creditLeaf.id },
    });
    expect(extra).not.toBeNull();
    // OPS was already snapshotted: its later bank statement stays out.
    const lateRow = await integrationOwner.engagementStatement.findFirst({
      where: { engagementId: seed.engagementId, nodeId: late.id },
    });
    expect(lateRow).toBeNull();
  });

  it("auto-select snapshots only newly selected modules and is safe to repeat", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );
    const late = await addLateOpsLeaf(tenant.id, seed.ops.id);
    const session = fakeSession({
      id: cae.id,
      tenantId: tenant.id,
      roles: ["CAE"],
    }) as never;

    await autoSelectModules(session, seed.engagementId);
    await autoSelectModules(session, seed.engagementId);

    const selected = await integrationOwner.engagementModule.count({
      where: { engagementId: seed.engagementId },
    });
    expect(selected).toBe(2);
    const rows = await integrationOwner.engagementStatement.findMany({
      where: { engagementId: seed.engagementId },
      select: { nodeId: true },
    });
    expect(rows.map((r) => r.nodeId).sort()).toEqual(
      [seed.opsA.id, seed.opsB.id, seed.creditLeaf.id].sort(),
    );
    expect(rows.some((r) => r.nodeId === late.id)).toBe(false);
  });

  it("freezes an engagement with no snapshot without requiring turned-off leaves", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await withFixtures(() =>
      integrationOwner.examinationNode.update({
        where: { id: seed.opsB.id },
        data: { isActive: false },
      }),
    );
    await score(tenant.id, seed.engagementId, seed.opsA.id, "FULLY_COMPLIANT");

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    const result = await freezeRbiaScore({ engagementId: seed.engagementId });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.compositeScore).toBe(1);
  });

  it("scores with the snapshot's weight and critical flag, not later catalogue edits", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await withFixtures(() =>
      integrationOwner.examinationNode.update({
        where: { id: seed.opsA.id },
        data: { weight: 3 },
      }),
    );
    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );
    // After the snapshot: OPS-001 drops to weight 1 and OPS-002 turns critical.
    await withFixtures(async () => {
      await integrationOwner.examinationNode.update({
        where: { id: seed.opsA.id },
        data: { weight: 1 },
      });
      await integrationOwner.examinationNode.update({
        where: { id: seed.opsB.id },
        data: { isCritical: true },
      });
    });
    await score(tenant.id, seed.engagementId, seed.opsA.id, "FULLY_COMPLIANT");
    await score(tenant.id, seed.engagementId, seed.opsB.id, "NON_COMPLIANT");

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    // Snapshot: (3 × 1.0 + 1 × 0.0) / 4 = 0.75, no critical cap.
    // Live weights would give 0.5; the live critical flag would cap at 0.5.
    const result = await freezeRbiaScore({ engagementId: seed.engagementId });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.compositeScore).toBeCloseTo(0.75);
  });

  it("freezes when a selected module snapshotted nothing because its statements are all off", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );
    await withFixtures(() =>
      integrationOwner.examinationNode.update({
        where: { id: seed.creditLeaf.id },
        data: { isActive: false },
      }),
    );
    await addModuleSelection(
      fakeSession({
        id: cae.id,
        tenantId: tenant.id,
        roles: ["CAE"],
      }) as never,
      seed.engagementId,
      seed.creditModule.id,
      "Branch also books gold loans",
    );
    await score(tenant.id, seed.engagementId, seed.opsA.id, "FULLY_COMPLIANT");
    await score(tenant.id, seed.engagementId, seed.opsB.id, "FULLY_COMPLIANT");

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    const result = await freezeRbiaScore({ engagementId: seed.engagementId });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.compositeScore).toBe(1);
  });

  it("refuses to freeze a selected module that has no statement snapshot", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );
    // CREDIT selected the old way: an EngagementModule row, no snapshot rows.
    await withFixtures(() =>
      integrationOwner.engagementModule.create({
        data: {
          tenantId: tenant.id,
          engagementId: seed.engagementId,
          moduleId: seed.creditModule.id,
        },
      }),
    );
    await score(tenant.id, seed.engagementId, seed.opsA.id, "FULLY_COMPLIANT");
    await score(tenant.id, seed.engagementId, seed.opsB.id, "FULLY_COMPLIANT");

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    const result = await freezeRbiaScore({ engagementId: seed.engagementId });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("INCOMPLETE_EXAMINATION");
      expect(result.error).toContain("CREDIT");
    }
  });

  it("still scores a pack-shaped tree whose parentId was never set", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);

    const housing = await withFixtures(async () => {
      const housingModule = await integrationOwner.auditModule.create({
        data: {
          tenantId: tenant.id,
          code: "CRD-HLN",
          name: "Housing Loans",
          domain: "CREDIT",
          kinds: ["CHECKLIST"],
          applicability: {},
        },
        select: { id: true },
      });
      await integrationOwner.examinationNode.create({
        data: {
          tenantId: tenant.id,
          moduleId: housingModule.id,
          code: "CRD-HLN",
          name: "Housing Loans",
          path: "CRD-HLN",
          depth: 1,
          isLeaf: false,
          parentId: null,
          weight: 1,
          isActive: true,
        },
        select: { id: true },
      });
      await integrationOwner.examinationNode.create({
        data: {
          tenantId: tenant.id,
          moduleId: housingModule.id,
          code: "CRD-HLN-PRE",
          name: "Pre-Sanction Checks",
          path: "CRD-HLN/CRD-HLN-PRE",
          depth: 2,
          isLeaf: false,
          parentId: null,
          weight: 0.2,
          isActive: true,
        },
        select: { id: true },
      });
      const leaf = await integrationOwner.examinationNode.create({
        data: {
          tenantId: tenant.id,
          moduleId: housingModule.id,
          code: "CRD-HLN-PRE-001",
          name: "Borrower Eligibility",
          path: "CRD-HLN/CRD-HLN-PRE/CRD-HLN-PRE-001",
          depth: 3,
          isLeaf: true,
          parentId: null,
          weight: 1,
          isActive: true,
        },
        select: { id: true },
      });
      await integrationOwner.engagementModule.create({
        data: {
          tenantId: tenant.id,
          engagementId: seed.engagementId,
          moduleId: housingModule.id,
        },
      });
      return { leaf };
    });

    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );
    await score(tenant.id, seed.engagementId, seed.opsA.id, "FULLY_COMPLIANT");
    await score(tenant.id, seed.engagementId, seed.opsB.id, "FULLY_COMPLIANT");

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    const blocked = await freezeRbiaScore({ engagementId: seed.engagementId });
    expect(blocked.success).toBe(false);
    if (!blocked.success) {
      expect(blocked.code).toBe("INCOMPLETE_EXAMINATION");
      expect(blocked.error).toContain("CRD-HLN-PRE-001");
    }

    await score(
      tenant.id,
      seed.engagementId,
      housing.leaf.id,
      "FULLY_COMPLIANT",
    );
    const frozen = await freezeRbiaScore({ engagementId: seed.engagementId });
    expect(frozen.success).toBe(true);
    if (frozen.success) expect(frozen.data.compositeScore).toBe(1);

    const snapshot = await integrationOwner.branchRbiaScore.findUniqueOrThrow({
      where: { engagementId: seed.engagementId },
      select: { moduleScores: true },
    });
    expect(Object.keys(snapshot.moduleScores as object).sort()).toEqual([
      "CRD-HLN",
      "OPS",
    ]);
  });

  it("weights the frozen composite by AuditModule.weight, not the tree node's weight", async () => {
    const tenant = await createTenant();
    const cae = await createUser(tenant.id, ["CAE"]);
    const seed = await seedExamination(tenant.id, cae.id);
    await materializeEngagementStatements(
      integrationOwner as never,
      seed.engagementId,
      tenant.id,
    );
    await addModuleSelection(
      fakeSession({
        id: cae.id,
        tenantId: tenant.id,
        roles: ["CAE"],
      }) as never,
      seed.engagementId,
      seed.creditModule.id,
      "Branch also books gold loans",
    );
    await withFixtures(async () => {
      await integrationOwner.auditModule.update({
        where: { tenantId_code: { tenantId: tenant.id, code: "OPS" } },
        data: { weight: 80 },
      });
      await integrationOwner.auditModule.update({
        where: { tenantId_code: { tenantId: tenant.id, code: "CREDIT" } },
        data: { weight: 20 },
      });
    });
    await score(tenant.id, seed.engagementId, seed.opsA.id, "FULLY_COMPLIANT");
    await score(tenant.id, seed.engagementId, seed.opsB.id, "FULLY_COMPLIANT");
    await score(
      tenant.id,
      seed.engagementId,
      seed.creditLeaf.id,
      "NON_COMPLIANT",
    );

    mockSessionModule(
      fakeSession({ id: cae.id, tenantId: tenant.id, roles: ["CAE"] }),
    );
    const { freezeRbiaScore } = await import("../freeze");

    // OPS = 1.0 at weight 80, CREDIT = 0.0 at weight 20 → 0.80.
    // Equal tree-node weights (both 1.0) would freeze at 0.50.
    const result = await freezeRbiaScore({ engagementId: seed.engagementId });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.compositeScore).toBeCloseTo(0.8);
  });
});
