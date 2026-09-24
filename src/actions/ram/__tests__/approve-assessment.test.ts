import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
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

import { approveRamAssessment } from "../approve-assessment";
import { getRequiredSession } from "@/data-access/session";
import { withAuditedMutation } from "@/data-access/audited-mutation";
import { BRANCH_A, USER_A, USER_B, fakeSession } from "@/test/factories";

const ASSESSMENT_A = "51515151-5151-4151-8151-515151515151";

function approvalTx(computedById: string) {
  return {
    ramAssessment: {
      findFirst: vi.fn().mockResolvedValue({
        id: ASSESSMENT_A,
        branchId: BRANCH_A,
        status: "COMPUTED",
        computedById,
        compositeScore: 4.8,
        auditFrequency: 12,
      }),
      update: vi.fn().mockResolvedValue({
        id: ASSESSMENT_A,
        status: "APPROVED",
      }),
    },
    branch: {
      update: vi.fn(),
    },
  };
}

describe("approveRamAssessment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes the computed score onto Branch after a different user approves", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ userId: USER_B, roles: ["CAE"] }) as never,
    );
    const tx = approvalTx(USER_A);
    vi.mocked(withAuditedMutation).mockImplementation((async (
      _actor: unknown,
      _action: unknown,
      fn: (t: typeof tx) => Promise<unknown>,
    ) => fn(tx)) as never);

    const result = await approveRamAssessment({ assessmentId: ASSESSMENT_A });

    expect(result).toEqual({
      success: true,
      data: { id: ASSESSMENT_A, status: "APPROVED" },
    });
    expect(tx.branch.update).toHaveBeenCalledWith({
      where: { id: BRANCH_A },
      data: { ramScore: 4.8, auditFrequency: 12 },
    });
  });

  it("does not publish when the computer tries to approve their own assessment", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ userId: USER_A, roles: ["CAE"] }) as never,
    );
    const tx = approvalTx(USER_A);
    vi.mocked(withAuditedMutation).mockImplementation((async (
      _actor: unknown,
      _action: unknown,
      fn: (t: typeof tx) => Promise<unknown>,
    ) => fn(tx)) as never);

    const result = await approveRamAssessment({ assessmentId: ASSESSMENT_A });

    expect(result).toEqual({
      success: false,
      error: "The person who computed the assessment cannot approve it",
    });
    expect(tx.branch.update).not.toHaveBeenCalled();
  });
});
