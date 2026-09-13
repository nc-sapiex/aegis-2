import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetDatabase,
  createTenant,
  createUser,
  integrationPrisma,
  withFixtures,
} from "../../../../tests/integration/harness";

async function seedOverdueComplianceItem(
  tenantId: string,
  daysOverdue: number,
) {
  return withFixtures(async () => {
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
    const user = await createUser(tenantId, ["AUDITOR"]);
    const moduleNode = await integrationPrisma.examinationNode.create({
      data: {
        tenantId,
        code: "MOD-001",
        name: "Test Module",
        path: "MOD-001",
        depth: 1,
        isLeaf: false,
        weight: 1,
        isCritical: false,
        applicableBranchTypes: [],
        displayOrder: 1,
      },
      select: { id: true },
    });
    const observation = await integrationPrisma.observation.create({
      data: {
        tenantId,
        title: "Overdue item",
        description: "Overdue compliance item details",
        recommendation: "r",
        severity: "HIGH",
        pertainsTo: "FINANCE",
        moduleId: moduleNode.id,
        status: "ISSUED",
        branchId: branch.id,
        createdById: user.id,
      },
      select: { id: true },
    });
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - daysOverdue);

    return integrationPrisma.complianceItem.create({
      data: {
        tenantId,
        observationId: observation.id,
        branchId: branch.id,
        status: "OPEN",
        dueDate,
        escalationLevel: 0,
        daysOpen: daysOverdue,
      },
      select: { id: true },
    });
  });
}

describe("runEscalationJobInternal", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("raises the escalation level of an overdue item", async () => {
    const tenant = await createTenant();
    const item = await seedOverdueComplianceItem(tenant.id, 45);

    const { runEscalationJobInternal } = await import("../run-escalation-job");
    const result = await runEscalationJobInternal(tenant.id);

    expect(result.success).toBe(true);
    const after = await integrationPrisma.complianceItem.findUniqueOrThrow({
      where: { id: item.id },
      select: { escalationLevel: true },
    });
    expect(after.escalationLevel).toBeGreaterThan(0);
  });

  it("touches no other tenant's items", async () => {
    const one = await createTenant("Bank One");
    const two = await createTenant("Bank Two");
    await seedOverdueComplianceItem(one.id, 45);
    const untouched = await seedOverdueComplianceItem(two.id, 45);

    const { runEscalationJobInternal } = await import("../run-escalation-job");
    await runEscalationJobInternal(one.id);

    const after = await integrationPrisma.complianceItem.findUniqueOrThrow({
      where: { id: untouched.id },
      select: { escalationLevel: true },
    });
    expect(after.escalationLevel).toBe(0);
  });

  it("is a no-op for a tenant with no open items", async () => {
    const tenant = await createTenant();
    const { runEscalationJobInternal } = await import("../run-escalation-job");
    const result = await runEscalationJobInternal(tenant.id);
    expect(result.success).toBe(true);
  });
});
