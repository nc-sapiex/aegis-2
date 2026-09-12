import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetDatabase,
  createTenant,
  createUser,
  fakeSession,
  mockSessionModule,
  integrationPrisma,
  withFixtures,
} from "../../../../tests/integration/harness";

async function seedPlanAndBranch(tenantId: string) {
  return withFixtures(async () => {
    const plan = await integrationPrisma.auditPlan.create({
      data: { tenantId, year: 2026, quarter: "Q1_APR_JUN", status: "PLANNED" },
      select: { id: true },
    });
    const branch = await integrationPrisma.branch.create({
      data: {
        tenantId,
        code: "BR-001",
        name: "Main",
        city: "Pune",
        state: "MH",
      },
      select: { id: true },
    });
    return { planId: plan.id, branchId: branch.id };
  });
}

describe("cross-tenant relation IDs", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("refuses an engagement that points at another tenant's plan", async () => {
    const attacker = await createTenant("Attacker Bank");
    const victim = await createTenant("Victim Bank");
    const attackerUser = await createUser(attacker.id, ["LEAD_AUDITOR"]);
    const attackerRefs = await seedPlanAndBranch(attacker.id);
    const victimRefs = await seedPlanAndBranch(victim.id);

    mockSessionModule(
      fakeSession({
        id: attackerUser.id,
        tenantId: attacker.id,
        roles: ["LEAD_AUDITOR"],
      }),
    );
    const { createEngagement } = await import("../create-engagement");

    const result = await createEngagement({
      auditPlanId: victimRefs.planId,
      branchId: attackerRefs.branchId,
      auditNumber: "RBIA/2026-27/BR-001/V1",
      auditType: "RBIA",
      visitNumber: 1,
      periodFrom: "2026-04-01",
      periodTo: "2026-06-30",
      scheduledStartDate: "2026-04-01",
      completionDate: "2026-06-30",
    });

    expect(result.success).toBe(false);
    const leaked = await integrationPrisma.auditEngagement.count({
      where: { auditPlanId: victimRefs.planId },
    });
    expect(leaked).toBe(0);
  });

  it("refuses a team assignment of another tenant's user", async () => {
    const attacker = await createTenant("Attacker Bank");
    const victim = await createTenant("Victim Bank");
    const manager = await createUser(attacker.id, ["LEAD_AUDITOR"]);
    const victimUser = await createUser(victim.id, ["AUDITOR"]);
    const refs = await seedPlanAndBranch(attacker.id);

    const engagement = await withFixtures(() =>
      integrationPrisma.auditEngagement.create({
        data: {
          tenantId: attacker.id,
          auditPlanId: refs.planId,
          branchId: refs.branchId,
          auditNumber: "RBIA/2026-27/BR-001/V1",
          periodFrom: new Date("2026-04-01"),
          periodTo: new Date("2026-06-30"),
          status: "PLANNED",
        },
        select: { id: true },
      }),
    );

    mockSessionModule(
      fakeSession({
        id: manager.id,
        tenantId: attacker.id,
        roles: ["LEAD_AUDITOR"],
      }),
    );
    const { assignTeamMember } = await import("../assign-team");

    const result = await assignTeamMember({
      engagementId: engagement.id,
      userId: victimUser.id,
      roleInEngagement: "FIELD_AUDITOR",
      assignedSections: ["CASH"],
    });

    expect(result.success).toBe(false);
    const leaked = await integrationPrisma.auditTeamMember.count({
      where: { userId: victimUser.id },
    });
    expect(leaked).toBe(0);
  });

  it("still creates an engagement whose references are all in-tenant", async () => {
    const tenant = await createTenant();
    const manager = await createUser(tenant.id, ["LEAD_AUDITOR"]);
    const refs = await seedPlanAndBranch(tenant.id);

    mockSessionModule(
      fakeSession({
        id: manager.id,
        tenantId: tenant.id,
        roles: ["LEAD_AUDITOR"],
      }),
    );
    const { createEngagement } = await import("../create-engagement");

    const result = await createEngagement({
      auditPlanId: refs.planId,
      branchId: refs.branchId,
      auditNumber: "RBIA/2026-27/BR-001/V1",
      auditType: "RBIA",
      visitNumber: 1,
      periodFrom: "2026-04-01",
      periodTo: "2026-06-30",
      scheduledStartDate: "2026-04-01",
      completionDate: "2026-06-30",
    });

    expect(result.success).toBe(true);
  });
});
