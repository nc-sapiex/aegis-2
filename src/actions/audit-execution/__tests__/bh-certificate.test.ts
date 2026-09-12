import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/prisma", () => ({ prismaForTenant: vi.fn() }));
vi.mock("@/data-access/audit-context", () => ({ setAuditContext: vi.fn() }));
vi.mock("@/data-access/access-guards", () => ({
  requireBranchAssignment: vi.fn(),
  requireTeamMembership: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { signBhCertificate, countersignBhCertificate } from "../bh-certificate";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import {
  requireBranchAssignment,
  requireTeamMembership,
} from "@/data-access/access-guards";
import {
  BRANCH_A,
  ENGAGEMENT_A,
  USER_A,
  USER_B,
  fakeDb,
  fakeSession,
} from "@/test/factories";

const SIGN_INPUT = {
  engagementId: ENGAGEMENT_A,
  comments: "Records verified.",
  declarationAccepted: true as const,
};

describe("signBhCertificate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireBranchAssignment).mockResolvedValue({ ok: true });
  });

  it("refuses a branch head from another branch", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );
    vi.mocked(requireBranchAssignment).mockResolvedValue({
      ok: false,
      error: "You are not assigned to this branch.",
    });
    const updateMany = vi.fn();
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({
        auditEngagement: {
          findFirst: vi.fn().mockResolvedValue({
            id: ENGAGEMENT_A,
            branchId: BRANCH_A,
            bhCertSignedAt: null,
          }),
          updateMany,
        },
      }),
    );

    const result = await signBhCertificate(SIGN_INPUT);

    expect(result).toEqual({
      success: false,
      error: "You are not assigned to this branch.",
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("allows the assigned branch head to sign", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );
    const signedAt = new Date();
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({
        auditEngagement: {
          // First call authorizes against an unsigned engagement; the second,
          // inside the transaction, reads back the timestamp just written.
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({
              id: ENGAGEMENT_A,
              branchId: BRANCH_A,
              bhCertSignedAt: null,
            })
            .mockResolvedValue({ id: ENGAGEMENT_A, bhCertSignedAt: signedAt }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    );

    const result = await signBhCertificate(SIGN_INPUT);

    expect(result.success).toBe(true);
  });
});

describe("countersignBhCertificate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeamMembership).mockResolvedValue({ ok: true });
  });

  function signedEngagement(signedById: string) {
    return fakeDb({
      auditEngagement: {
        findFirst: vi.fn().mockResolvedValue({
          id: ENGAGEMENT_A,
          bhCertSignedAt: new Date(),
          bhCertSignedById: signedById,
          bhCertCountersignedAt: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: ENGAGEMENT_A,
          bhCertCountersignedAt: new Date(),
        }),
      },
    });
  }

  it("refuses a lead auditor who is not on the engagement team", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ userId: USER_B, roles: ["LEAD_AUDITOR"] }) as never,
    );
    vi.mocked(requireTeamMembership).mockResolvedValue({
      ok: false,
      error: "You are not on the audit team for this engagement.",
    });
    vi.mocked(prismaForTenant).mockReturnValue(signedEngagement(USER_A));

    const result = await countersignBhCertificate({
      engagementId: ENGAGEMENT_A,
    });

    expect(result).toEqual({
      success: false,
      error: "You are not on the audit team for this engagement.",
    });
  });

  it("does not require team membership from an audit manager", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ userId: USER_B, roles: ["AUDIT_MANAGER"] }) as never,
    );
    vi.mocked(prismaForTenant).mockReturnValue(signedEngagement(USER_A));

    const result = await countersignBhCertificate({
      engagementId: ENGAGEMENT_A,
    });

    expect(result.success).toBe(true);
    expect(requireTeamMembership).not.toHaveBeenCalled();
  });

  it("refuses the signer countersigning their own certificate", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({
        userId: USER_A,
        roles: ["BRANCH_HEAD", "AUDIT_MANAGER"],
      }) as never,
    );
    vi.mocked(prismaForTenant).mockReturnValue(signedEngagement(USER_A));

    const result = await countersignBhCertificate({
      engagementId: ENGAGEMENT_A,
    });

    expect(result).toEqual({
      success: false,
      error:
        "You signed this certificate; a different user must countersign it.",
    });
  });
});
