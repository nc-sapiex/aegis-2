import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getLastVisitedSection,
  recordSectionVisit,
} from "@/data-access/engagement-visits";
import {
  integrationOwner,
  createTenant,
  createUser,
  resetDatabase,
  withFixtures,
} from "../../../tests/integration/harness";

let tenantId: string;
let userId: string;
let engagementId: string;

beforeAll(async () => {
  await resetDatabase();
  await withFixtures(async () => {
    tenantId = (await createTenant("Visit Bank")).id;
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
        status: "PLANNED",
      },
    });
    engagementId = engagement.id;
  });
});

afterAll(async () => integrationOwner.$disconnect());

describe("engagement section visits", () => {
  it("no visit yet: null", async () => {
    expect(
      await getLastVisitedSection(tenantId, engagementId, userId),
    ).toBeNull();
  });

  it("records and returns the last visited section", async () => {
    const sectionA = randomUUID();
    const sectionB = randomUUID();
    await recordSectionVisit(tenantId, engagementId, userId, sectionA);
    expect(await getLastVisitedSection(tenantId, engagementId, userId)).toBe(
      sectionA,
    );
    await recordSectionVisit(tenantId, engagementId, userId, sectionB);
    expect(await getLastVisitedSection(tenantId, engagementId, userId)).toBe(
      sectionB,
    );
  });
});
