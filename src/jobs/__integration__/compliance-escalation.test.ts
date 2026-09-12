import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetDatabase,
  createTenant,
  createUser,
  integrationPrisma,
} from "../../../tests/integration/harness";

describe("processComplianceEscalation", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.resetModules();
  });

  it("runs across every tenant and survives one tenant failing", async () => {
    const one = await createTenant("Bank One");
    const two = await createTenant("Bank Two");
    await createUser(one.id, ["CAE"]);
    await createUser(two.id, ["CAE"]);

    const seen: string[] = [];
    vi.doMock("@/actions/compliance/run-escalation-job", () => ({
      runEscalationJobInternal: vi.fn(async (tenantId: string) => {
        seen.push(tenantId);
        if (tenantId === one.id) throw new Error("simulated tenant failure");
        return { success: true, data: { escalated: 0 } };
      }),
    }));

    const { processComplianceEscalation } =
      await import("../compliance-escalation");
    await processComplianceEscalation();

    expect(new Set(seen)).toEqual(new Set([one.id, two.id]));
  });

  it("does nothing when there are no tenants", async () => {
    const { processComplianceEscalation } =
      await import("../compliance-escalation");
    await expect(processComplianceEscalation()).resolves.toBeUndefined();
    expect(await integrationPrisma.tenant.count()).toBe(0);
  });
});
