import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/prisma", () => ({ prismaForTenant: vi.fn() }));
vi.mock("@/data-access/access-guards", () => ({
  requireBranchAssignment: vi.fn(),
}));
vi.mock("@/data-access/audited-mutation", () => ({
  withAuditedMutation: vi.fn(),
  userActor: vi.fn((s: { user: { id: string; tenantId: string } }) => ({
    kind: "user" as const,
    userId: s.user.id,
    tenantId: s.user.tenantId,
  })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { submitBmResponse } from "../findings";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { requireBranchAssignment } from "@/data-access/access-guards";
import { withAuditedMutation } from "@/data-access/audited-mutation";
import {
  BRANCH_A,
  BRANCH_B,
  ENGAGEMENT_A,
  TENANT_A,
  USER_A,
  fakeDb,
  fakeSession,
} from "@/test/factories";

const ACTION_POINT_A = "51515151-5151-4151-8151-515151515151";

const VALID_INPUT = {
  actionPointId: ACTION_POINT_A,
  responseText: "Rectified. Sanction note and KYC re-verified.",
};

function respondableDb(branchId: string) {
  return fakeDb({
    actionPoint: {
      findFirst: vi.fn().mockResolvedValue({
        id: ACTION_POINT_A,
        status: "ISSUED",
        engagementId: ENGAGEMENT_A,
        branchId,
      }),
      update: vi.fn().mockResolvedValue({
        id: ACTION_POINT_A,
        status: "BM_RESPONDED",
      }),
    },
    bmResponseBatch: {
      findUnique: vi.fn().mockResolvedValue({ id: "batch-1" }),
      update: vi.fn().mockResolvedValue({ id: "batch-1" }),
    },
  });
}

describe("submitBmResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireBranchAssignment).mockResolvedValue({ ok: true });
    vi.mocked(withAuditedMutation).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (_actor: unknown, _action: unknown, fn: any) =>
        fn(vi.mocked(prismaForTenant)(TENANT_A))) as never,
    );
  });

  it("refuses a role without action_point:bm_respond", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["AUDITOR"] }) as never,
    );

    const result = await submitBmResponse(VALID_INPUT);

    expect(result).toEqual({
      success: false,
      error: "You do not have permission to submit BM responses.",
      code: "PERMISSION_DENIED",
    });
    expect(withAuditedMutation).not.toHaveBeenCalled();
  });

  it("refuses a branch head acting on a branch they are not assigned to", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );
    vi.mocked(requireBranchAssignment).mockResolvedValue({
      ok: false,
      error: "You are not assigned to this branch.",
    });
    const db = respondableDb(BRANCH_B);
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await submitBmResponse(VALID_INPUT);

    expect(result).toEqual({
      success: false,
      error: "You are not assigned to this branch.",
      code: "PERMISSION_DENIED",
    });
    expect(requireBranchAssignment).toHaveBeenCalledWith(
      { userId: USER_A, tenantId: TENANT_A },
      BRANCH_B,
    );
    expect(db.actionPoint.update).not.toHaveBeenCalled();
    expect(withAuditedMutation).not.toHaveBeenCalled();
  });

  it("records the response when the branch head is assigned to the AP's branch", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );
    const db = respondableDb(BRANCH_A);
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await submitBmResponse(VALID_INPUT);

    expect(result).toEqual({
      success: true,
      data: { id: ACTION_POINT_A, status: "BM_RESPONDED" },
    });
    expect(requireBranchAssignment).toHaveBeenCalledWith(
      { userId: USER_A, tenantId: TENANT_A },
      BRANCH_A,
    );
    expect(db.actionPoint.update).toHaveBeenCalledTimes(1);
  });
});
