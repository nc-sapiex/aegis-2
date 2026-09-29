import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ hasPermission: vi.fn() }));
vi.mock("@/jobs/run-escalation-for-tenant", () => ({
  runEscalationJobInternal: vi.fn(),
}));

import { runEscalationJob } from "../run-escalation-job";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { runEscalationJobInternal } from "@/jobs/run-escalation-for-tenant";
import { fakeSession, TENANT_A, TENANT_B } from "@/test/factories";

describe("runEscalationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runEscalationJobInternal).mockResolvedValue({
      success: true,
      data: { processed: 0, escalated: 0, notificationsSent: 0 },
    });
  });

  it("is the only export of the use-server module", () => {
    const src = readFileSync(
      join(process.cwd(), "src/actions/compliance/run-escalation-job.ts"),
      "utf-8",
    );
    expect(src).toMatch(/^["']use server["'];?$/m);
    expect(src).toContain("export async function runEscalationJob");
    expect(src).not.toContain("export async function runEscalationJobInternal");
    expect(src).not.toContain("export { runEscalationJobInternal");
  });

  it("refuses a session without escalation:compute and does not run the worker", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );
    vi.mocked(hasPermission).mockReturnValue(false);

    await expect(runEscalationJob()).rejects.toThrow(
      "Unauthorized: escalation:compute permission required",
    );
    expect(runEscalationJobInternal).not.toHaveBeenCalled();
  });

  it("passes the session tenant, never a caller-supplied id", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["CAE"], tenantId: TENANT_A }) as never,
    );
    vi.mocked(hasPermission).mockReturnValue(true);

    await runEscalationJob();

    expect(runEscalationJobInternal).toHaveBeenCalledTimes(1);
    expect(runEscalationJobInternal).toHaveBeenCalledWith(TENANT_A);
    expect(runEscalationJobInternal).not.toHaveBeenCalledWith(TENANT_B);
  });
});
