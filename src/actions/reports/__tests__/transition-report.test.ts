import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/prisma", () => ({ prismaForTenant: vi.fn() }));
vi.mock("@/data-access/audit-context", () => ({ setAuditContext: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { transitionReportStatus } from "../transition-report";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import {
  ENGAGEMENT_A,
  USER_A,
  USER_B,
  fakeDb,
  fakeSession,
} from "@/test/factories";

function engagementDb(reviewedById: string | null) {
  return fakeDb({
    auditEngagement: {
      findFirst: vi.fn().mockResolvedValue({
        id: ENGAGEMENT_A,
        reportStatus: "REVIEWED",
        bhCertSignedAt: new Date(),
        reportReviewedById: reviewedById,
        reportApprovedById: null,
        observations: [{ id: "obs-1" }],
      }),
      update: vi.fn().mockResolvedValue({ id: ENGAGEMENT_A }),
    },
  });
}

const APPROVE_INPUT = {
  engagementId: ENGAGEMENT_A,
  targetStatus: "APPROVED" as const,
  comments: "Approved for issue.",
};

describe("transitionReportStatus maker-checker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses approval by the user who reviewed the report", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ userId: USER_A, roles: ["AUDIT_MANAGER"] }) as never,
    );
    const db = engagementDb(USER_A);
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await transitionReportStatus(APPROVE_INPUT);

    expect(result).toEqual({
      success: false,
      error:
        "You reviewed this record; a different user must perform this step.",
    });
    expect(db.auditEngagement.update).not.toHaveBeenCalled();
  });

  it("allows approval by a different user", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ userId: USER_B, roles: ["AUDIT_MANAGER"] }) as never,
    );
    const db = engagementDb(USER_A);
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await transitionReportStatus(APPROVE_INPUT);

    expect(result.success).toBe(true);
    expect(db.auditEngagement.update).toHaveBeenCalledTimes(1);
  });
});
