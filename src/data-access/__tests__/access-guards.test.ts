import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prismaForTenant: vi.fn() }));

import {
  requireBranchAssignment,
  requireTeamMembership,
} from "../access-guards";
import { prismaForTenant } from "@/lib/prisma";
import {
  TENANT_A,
  USER_A,
  BRANCH_A,
  ENGAGEMENT_A,
  fakeDb,
} from "@/test/factories";

const ACTOR = { userId: USER_A, tenantId: TENANT_A };

describe("requireBranchAssignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admits a user assigned to the branch", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "assignment-1" });
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({ userBranchAssignment: { findFirst } }),
    );

    expect(await requireBranchAssignment(ACTOR, BRANCH_A)).toEqual({
      ok: true,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: USER_A, branchId: BRANCH_A, tenantId: TENANT_A },
      select: { id: true },
    });
  });

  it("refuses a user with no assignment to the branch", async () => {
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({
        userBranchAssignment: { findFirst: vi.fn().mockResolvedValue(null) },
      }),
    );

    expect(await requireBranchAssignment(ACTOR, BRANCH_A)).toEqual({
      ok: false,
      error: "You are not assigned to this branch.",
    });
  });

  it("refuses when the branch cannot be resolved at all", async () => {
    expect(await requireBranchAssignment(ACTOR, null)).toEqual({
      ok: false,
      error:
        "This record is not linked to a branch, so branch access cannot be verified.",
    });
    expect(prismaForTenant).not.toHaveBeenCalled();
  });
});

describe("requireTeamMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admits a member of the engagement's audit team", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "member-1" });
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({ auditTeamMember: { findFirst } }),
    );

    expect(await requireTeamMembership(ACTOR, ENGAGEMENT_A)).toEqual({
      ok: true,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        engagementId: ENGAGEMENT_A,
        userId: USER_A,
        tenantId: TENANT_A,
      },
      select: { id: true },
    });
  });

  it("refuses a non-member", async () => {
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({
        auditTeamMember: { findFirst: vi.fn().mockResolvedValue(null) },
      }),
    );

    expect(await requireTeamMembership(ACTOR, ENGAGEMENT_A)).toEqual({
      ok: false,
      error: "You are not on the audit team for this engagement.",
    });
  });
});
