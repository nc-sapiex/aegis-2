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

async function seedObservation(tenantId: string, createdById: string) {
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
    return integrationPrisma.observation.create({
      data: {
        tenantId,
        title: "Concurrency probe",
        condition: "c",
        criteria: "c",
        cause: "c",
        effect: "c",
        recommendation: "r",
        severity: "HIGH",
        status: "DRAFT",
        branchId: branch.id,
        createdById,
        version: 1,
      },
      select: { id: true, version: true },
    });
  });
}

describe("transitionObservation concurrency", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("lets exactly one of two concurrent identical transitions win", async () => {
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["AUDITOR"]);
    const observation = await seedObservation(tenant.id, auditor.id);

    mockSessionModule(
      fakeSession({ id: auditor.id, tenantId: tenant.id, roles: ["AUDITOR"] }),
    );
    const { transitionObservation } = await import("../transition");

    const input = {
      observationId: observation.id,
      targetStatus: "SUBMITTED" as const,
      version: 1,
      comment: "Submitting for review",
    };

    const [a, b] = await Promise.all([
      transitionObservation(input),
      transitionObservation(input),
    ]);

    const winners = [a, b].filter((r) => r.success);
    expect(winners).toHaveLength(1);

    const timeline = await integrationPrisma.observationTimeline.count({
      where: { observationId: observation.id, event: "status_changed" },
    });
    expect(timeline).toBe(1);

    const after = await integrationPrisma.observation.findUniqueOrThrow({
      where: { id: observation.id },
      select: { version: true, status: true },
    });
    expect(after.version).toBe(2);
    expect(after.status).toBe("SUBMITTED");
  });

  it("rejects a stale version with a refresh message", async () => {
    const tenant = await createTenant();
    const auditor = await createUser(tenant.id, ["AUDITOR"]);
    const observation = await seedObservation(tenant.id, auditor.id);

    mockSessionModule(
      fakeSession({ id: auditor.id, tenantId: tenant.id, roles: ["AUDITOR"] }),
    );
    const { transitionObservation } = await import("../transition");

    const result = await transitionObservation({
      observationId: observation.id,
      targetStatus: "SUBMITTED",
      version: 99,
      comment: "Stale",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/refresh/i);
  });

  it("refuses an observation belonging to another tenant", async () => {
    const owner = await createTenant("Owner Bank");
    const other = await createTenant("Other Bank");
    const ownerUser = await createUser(owner.id, ["AUDITOR"]);
    const otherUser = await createUser(other.id, ["AUDITOR"]);
    const observation = await seedObservation(owner.id, ownerUser.id);

    mockSessionModule(
      fakeSession({ id: otherUser.id, tenantId: other.id, roles: ["AUDITOR"] }),
    );
    const { transitionObservation } = await import("../transition");

    const result = await transitionObservation({
      observationId: observation.id,
      targetStatus: "SUBMITTED",
      version: 1,
      comment: "Cross tenant",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not found/i);
  });
});
