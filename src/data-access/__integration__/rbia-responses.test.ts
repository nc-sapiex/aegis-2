import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  integrationOwner,
  createTenant,
  createUser,
  fakeSession,
  mockSessionModule,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

let tenantId: string;
let branchId: string;
let engagementId: string;
let nodeId: string;
let unscoredNodeId: string;
let userId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Score Bank")).id;
    const user = await createUser(tenantId, ["LEAD_AUDITOR"]);
    userId = user.id;
    const branch = await integrationOwner.branch.create({
      data: {
        tenantId,
        name: "B",
        code: "B01",
        city: "Pune",
        state: "MH",
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
        status: "IN_PROGRESS",
      },
    });
    engagementId = engagement.id;
    branchId = branch.id;
    const auditModule = await integrationOwner.auditModule.create({
      data: {
        tenantId,
        code: "CRD",
        name: "Credit",
        domain: "CREDIT",
        kinds: ["CHECKLIST"],
        applicability: {},
      },
    });
    const node = await integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId: auditModule.id,
        code: "CRD-01",
        name: "Doc",
        path: "CRD/CRD-01",
        depth: 1,
        isLeaf: true,
        weight: 1,
        isCritical: false,
        description: "Loan file is complete",
      },
    });
    nodeId = node.id;
    await integrationOwner.examinationResponse.create({
      data: { tenantId, engagementId, nodeId },
    });

    const unscoredNode = await integrationOwner.examinationNode.create({
      data: {
        tenantId,
        moduleId: auditModule.id,
        code: "CRD-02",
        name: "Doc2",
        path: "CRD/CRD-02",
        depth: 1,
        isLeaf: true,
        weight: 1,
        isCritical: false,
        description: "Loan file has a valuation report",
      },
    });
    unscoredNodeId = unscoredNode.id;
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("scoreStatement", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSessionModule(
      fakeSession({ id: userId, tenantId, roles: ["LEAD_AUDITOR"] }),
    );
  });

  it("scores a statement above Largely with no remarks required", async () => {
    const { scoreStatement } = await import("@/actions/rbia/score-statement");
    const result = await scoreStatement({
      engagementId,
      nodeId,
      scoreLabel: "FULLY_COMPLIANT",
      remarks: null,
      expectedVersion: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBe(2);
  });

  it("rejects a stale version with a conflict", async () => {
    const { scoreStatement } = await import("@/actions/rbia/score-statement");
    const result = await scoreStatement({
      engagementId,
      nodeId,
      scoreLabel: "NON_COMPLIANT",
      remarks: "No file",
      expectedVersion: 1, // stale, real version is now 2
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.conflict).toBe(true);
  });

  it("accepts the current version and advances it again", async () => {
    const { scoreStatement } = await import("@/actions/rbia/score-statement");
    const result = await scoreStatement({
      engagementId,
      nodeId,
      scoreLabel: "NON_COMPLIANT",
      remarks: "No file on record",
      expectedVersion: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBe(3);
  });

  it("creates a response on first score when no row exists yet", async () => {
    const { scoreStatement } = await import("@/actions/rbia/score-statement");
    const result = await scoreStatement({
      engagementId,
      nodeId: unscoredNodeId,
      scoreLabel: "FULLY_COMPLIANT",
      remarks: null,
      expectedVersion: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBe(2);
  });

  it("refuses to score once the engagement's score is frozen", async () => {
    await withFixtures(() =>
      integrationOwner.branchRbiaScore.create({
        data: {
          tenantId,
          engagementId,
          branchId,
          compositeScore: 0.5,
          ratingBand: "SATISFACTORY",
          moduleScores: {},
          scoringTreeSnapshot: {},
          frozenAt: new Date(),
        },
      }),
    );

    const { scoreStatement } = await import("@/actions/rbia/score-statement");
    const result = await scoreStatement({
      engagementId,
      nodeId,
      scoreLabel: "FULLY_COMPLIANT",
      remarks: null,
      expectedVersion: 3,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/frozen/i);
  });
});
