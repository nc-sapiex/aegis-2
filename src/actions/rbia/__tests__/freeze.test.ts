import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/prisma", () => ({ prismaForTenant: vi.fn() }));
vi.mock("@/data-access/instance-scoring", () => ({
  syncAllInstanceScores: vi.fn(),
  findIncompleteInstanceModuleCodes: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/data-access/audited-mutation", () => ({
  withAuditedMutation: vi.fn(),
  userActor: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { freezeRbiaScore } from "../freeze";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { syncAllInstanceScores } from "@/data-access/instance-scoring";
import { withAuditedMutation } from "@/data-access/audited-mutation";
import { ENGAGEMENT_A, fakeDb, fakeSession } from "@/test/factories";

describe("freezeRbiaScore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["CAE"] }) as never,
    );
  });

  it("refuses a retry without syncing instance scores", async () => {
    const db = fakeDb({
      branchRbiaScore: {
        findFirst: vi.fn().mockResolvedValue({ id: "frozen-score" }),
      },
    });
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await freezeRbiaScore({ engagementId: ENGAGEMENT_A });

    expect(result).toEqual({
      success: false,
      error: "Score has already been frozen for this engagement",
      code: "SCORE_FROZEN",
    });
    expect(syncAllInstanceScores).not.toHaveBeenCalled();
    expect(withAuditedMutation).not.toHaveBeenCalled();
  });
});
