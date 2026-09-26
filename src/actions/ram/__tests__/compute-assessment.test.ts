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
vi.mock("@/lib/repeat-finding-detector", () => ({
  detectRepeatFindingsForBranch: vi.fn(),
  computeRepeatUplift: vi.fn((composite: number) => ({
    adjustedScore: composite,
    upliftApplied: false,
    upliftFactor: 1,
    repeatCount: 0,
  })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { computeRamAssessment } from "../compute-assessment";
import { getRequiredSession } from "@/data-access/session";
import { withAuditedMutation } from "@/data-access/audited-mutation";
import { detectRepeatFindingsForBranch } from "@/lib/repeat-finding-detector";
import { BRANCH_A, USER_A, fakeSession } from "@/test/factories";

const ASSESSMENT_A = "51515151-5151-4151-8151-515151515151";
const PARAM_A = "61616161-6161-4161-8161-616161616161";
const PARAM_B = "62626262-6262-4262-8262-626262626262";

function scoreRow(
  paramConfigId: string,
  code: string,
  score: number,
  weight: number,
) {
  return {
    paramConfigId,
    score,
    paramConfig: { code, weight },
  };
}

function assessmentTx(options: {
  scores: ReturnType<typeof scoreRow>[];
  activeParamIds: string[];
  status?: string;
}) {
  const tx = {
    ramAssessment: {
      findFirst: vi.fn().mockResolvedValue({
        id: ASSESSMENT_A,
        branchId: BRANCH_A,
        status: options.status ?? "DRAFT",
        scores: options.scores,
      }),
      update: vi.fn().mockResolvedValue({
        id: ASSESSMENT_A,
        compositeScore: 4.8,
        riskCategory: "HIGH",
        auditFrequency: 12,
      }),
    },
    ramParameterConfig: {
      findMany: vi
        .fn()
        .mockResolvedValue(options.activeParamIds.map((id) => ({ id }))),
    },
    branch: {
      update: vi.fn(),
    },
  };
  return tx;
}

describe("computeRamAssessment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ userId: USER_A, roles: ["AUDIT_MANAGER"] }) as never,
    );
    vi.mocked(detectRepeatFindingsForBranch).mockResolvedValue({
      branchId: BRANCH_A,
      hasRepeatFindings: false,
      repeatCount: 0,
      totalPriorFindings: 0,
      repeatRatio: 0,
      repeatFindings: [],
    });
  });

  it("refuses a partial parameter set and does not write Branch.ramScore", async () => {
    const tx = assessmentTx({
      scores: [scoreRow(PARAM_A, "CR-01", 1, 0.05)],
      activeParamIds: [PARAM_A, PARAM_B],
    });
    vi.mocked(withAuditedMutation).mockImplementation((async (
      _actor: unknown,
      _action: unknown,
      fn: (t: typeof tx) => Promise<unknown>,
    ) => fn(tx)) as never);

    const result = await computeRamAssessment({ assessmentId: ASSESSMENT_A });

    expect(result).toEqual({
      success: false,
      error: "Please score all parameters before computing.",
    });
    expect(tx.ramAssessment.update).not.toHaveBeenCalled();
    expect(tx.branch.update).not.toHaveBeenCalled();
  });

  it("computes a complete set without publishing Branch.ramScore", async () => {
    const tx = assessmentTx({
      scores: [
        scoreRow(PARAM_A, "CR-01", 1, 0.05),
        scoreRow(PARAM_B, "BR-01", 5, 0.95),
      ],
      activeParamIds: [PARAM_A, PARAM_B],
    });
    vi.mocked(withAuditedMutation).mockImplementation((async (
      _actor: unknown,
      _action: unknown,
      fn: (t: typeof tx) => Promise<unknown>,
    ) => fn(tx)) as never);

    const result = await computeRamAssessment({ assessmentId: ASSESSMENT_A });

    expect(result.success).toBe(true);
    expect(tx.ramAssessment.update).toHaveBeenCalledTimes(1);
    expect(tx.branch.update).not.toHaveBeenCalled();
  });
});
