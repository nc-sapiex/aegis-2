import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../prisma", () => ({ prismaForTenant: vi.fn() }));
vi.mock("../access-guards", () => ({ requireBranchAssignment: vi.fn() }));

import { getBmResponseBatchForEngagement } from "../rbia-bm-response";
import { prismaForTenant } from "../prisma";
import { requireBranchAssignment } from "../access-guards";
import {
  BRANCH_A,
  BRANCH_B,
  ENGAGEMENT_A,
  TENANT_A,
  USER_A,
  fakeDb,
  fakeSession,
} from "@/test/factories";

const BATCH = {
  id: "batch-1",
  deadline: new Date("2026-10-18T00:00:00.000Z"),
  status: "PENDING",
  totalActionPoints: 2,
  respondedActionPoints: 0,
  engagement: {
    id: ENGAGEMENT_A,
    branchId: BRANCH_B,
    branch: { name: "Other Branch" },
    auditPlan: { year: 2026, quarter: "Q2_JUL_SEP" },
  },
};

describe("getBmResponseBatchForEngagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides another branch's batch from a branch head who is not assigned there", async () => {
    vi.mocked(requireBranchAssignment).mockResolvedValue({
      ok: false,
      error: "You are not assigned to this branch.",
    });
    const findMany = vi.fn();
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({
        bmResponseBatch: {
          findFirst: vi.fn().mockResolvedValue(BATCH),
        },
        actionPoint: { findMany },
      }),
    );

    const result = await getBmResponseBatchForEngagement(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
      ENGAGEMENT_A,
    );

    expect(result).toBeNull();
    expect(requireBranchAssignment).toHaveBeenCalledWith(
      { userId: USER_A, tenantId: TENANT_A },
      BRANCH_B,
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns the batch when the caller is assigned to the engagement branch", async () => {
    vi.mocked(requireBranchAssignment).mockResolvedValue({ ok: true });
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({
        bmResponseBatch: {
          findFirst: vi.fn().mockResolvedValue({
            ...BATCH,
            engagement: { ...BATCH.engagement, branchId: BRANCH_A },
          }),
        },
        actionPoint: { findMany: vi.fn().mockResolvedValue([]) },
      }),
    );

    const result = await getBmResponseBatchForEngagement(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
      ENGAGEMENT_A,
    );

    expect(result).not.toBeNull();
    expect(result?.batch.engagement.id).toBe(ENGAGEMENT_A);
    expect(requireBranchAssignment).toHaveBeenCalledWith(
      { userId: USER_A, tenantId: TENANT_A },
      BRANCH_A,
    );
  });
});
