import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/prisma", () => ({ prismaForTenant: vi.fn() }));
vi.mock("@/data-access/audit-context", () => ({ setAuditContext: vi.fn() }));
vi.mock("@/data-access/access-guards", () => ({
  requireBranchAssignment: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { submitBranchResponse } from "../submit-branch-response";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { requireBranchAssignment } from "@/data-access/access-guards";
import {
  BRANCH_A,
  BRANCH_B,
  COMPLIANCE_ITEM_A,
  TENANT_A,
  USER_A,
  fakeDb,
  fakeSession,
} from "@/test/factories";

const VALID_INPUT = {
  complianceItemId: COMPLIANCE_ITEM_A,
  responseText: "Rectified; sanction note and KYC re-verified.",
};

describe("submitBranchResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireBranchAssignment).mockResolvedValue({ ok: true });
  });

  it("refuses a role without compliance:branch_response", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["AUDITOR"] }) as never,
    );

    const result = await submitBranchResponse(VALID_INPUT);

    expect(result).toEqual({
      success: false,
      error: "You do not have permission to submit branch responses.",
    });
  });

  it("refuses a response shorter than the schema minimum", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );

    const result = await submitBranchResponse({
      complianceItemId: COMPLIANCE_ITEM_A,
      responseText: "done",
    });

    expect(result.success).toBe(false);
  });

  it("submits a response for an open compliance item", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({
        complianceItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: COMPLIANCE_ITEM_A,
            status: "OPEN",
            branchId: BRANCH_A,
            observation: { branchId: BRANCH_A },
          }),
          update: vi.fn().mockResolvedValue({ id: COMPLIANCE_ITEM_A }),
        },
      }),
    );

    const result = await submitBranchResponse(VALID_INPUT);

    expect(result).toEqual({
      success: true,
      data: { id: COMPLIANCE_ITEM_A, status: "BRANCH_RESPONSE_SUBMITTED" },
    });
  });

  it("refuses a branch head acting on a branch they are not assigned to", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );
    vi.mocked(requireBranchAssignment).mockResolvedValue({
      ok: false,
      error: "You are not assigned to this branch.",
    });
    const update = vi.fn();
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({
        complianceItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: COMPLIANCE_ITEM_A,
            status: "OPEN",
            branchId: BRANCH_B,
            observation: { branchId: BRANCH_B },
          }),
          update,
        },
      }),
    );

    const result = await submitBranchResponse(VALID_INPUT);

    expect(result).toEqual({
      success: false,
      error: "You are not assigned to this branch.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("falls back to the observation's branch when the item has none", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["BRANCH_HEAD"] }) as never,
    );
    vi.mocked(prismaForTenant).mockReturnValue(
      fakeDb({
        complianceItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: COMPLIANCE_ITEM_A,
            status: "OPEN",
            branchId: null,
            observation: { branchId: BRANCH_A },
          }),
          update: vi.fn().mockResolvedValue({ id: COMPLIANCE_ITEM_A }),
        },
      }),
    );

    await submitBranchResponse(VALID_INPUT);

    expect(requireBranchAssignment).toHaveBeenCalledWith(
      { userId: USER_A, tenantId: TENANT_A },
      BRANCH_A,
    );
  });
});
