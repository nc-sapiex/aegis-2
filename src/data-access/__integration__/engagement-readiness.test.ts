import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEngagementReadiness } from "@/data-access/engagement-readiness";
import {
  integrationOwner,
  createTenant,
  createUser,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

let tenantId: string;
let engagementId: string;
let nodeId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Ready Bank")).id;
    await createUser(tenantId, ["CAE"]);
    const branch = await integrationOwner.branch.create({
      data: { tenantId, name: "B", code: "B01", city: "Pune", state: "MH" },
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
      },
    });
    nodeId = node.id;
    await integrationOwner.engagementStatement.create({
      data: {
        tenantId,
        engagementId,
        nodeId,
        text: "Loan file is complete",
        weight: 1,
        isCritical: false,
        origin: "BANK",
      },
    });
    await integrationOwner.examinationResponse.create({
      // remarks_due: scored below Largely, no remarks yet
      data: {
        tenantId,
        engagementId,
        nodeId,
        scoreLabel: "PARTIALLY_COMPLIANT",
      },
    });
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("getEngagementReadiness", () => {
  it("counts a remarks-due row and reports fieldwork incomplete", async () => {
    const readiness = await getEngagementReadiness(tenantId, engagementId);
    expect(readiness.needsRemarks).toBe(1);
    expect(readiness.fieldworkComplete).toBe(false);
  });

  it("reports fieldwork incomplete for a statement with no response row yet", async () => {
    const untouchedNode = await withFixtures(async () => {
      const node = await integrationOwner.examinationNode.create({
        data: {
          tenantId,
          moduleId: (
            await integrationOwner.auditModule.findFirstOrThrow({
              where: { tenantId, code: "CRD" },
            })
          ).id,
          code: "CRD-02",
          name: "Doc2",
          path: "CRD/CRD-02",
          depth: 1,
          isLeaf: true,
          weight: 1,
          isCritical: false,
        },
      });
      await integrationOwner.engagementStatement.create({
        data: {
          tenantId,
          engagementId,
          nodeId: node.id,
          text: "Loan file has a valuation report",
          weight: 1,
          isCritical: false,
          origin: "BANK",
        },
      });
      return node;
    });

    const readiness = await getEngagementReadiness(tenantId, engagementId);
    expect(readiness.fieldworkComplete).toBe(false);
    expect(untouchedNode.code).toBe("CRD-02");
  });
});
