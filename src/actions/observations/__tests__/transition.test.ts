import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/prisma", () => ({ prismaForTenant: vi.fn() }));
vi.mock("@/data-access/audit-context", () => ({ setAuditContext: vi.fn() }));
vi.mock("@/data-access/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { transitionObservation } from "../transition";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import {
  OBSERVATION_A,
  USER_A,
  USER_B,
  fakeDb,
  fakeSession,
} from "@/test/factories";

function observationDb(createdById: string) {
  return fakeDb({
    observation: {
      findFirst: vi.fn().mockResolvedValue({
        id: OBSERVATION_A,
        status: "SUBMITTED",
        severity: "MEDIUM",
        version: 1,
        createdById,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    observationTimeline: { create: vi.fn().mockResolvedValue({}) },
  });
}

const REVIEW_INPUT = {
  observationId: OBSERVATION_A,
  targetStatus: "REVIEWED" as const,
  comment: "Reviewed against the sanction file.",
  version: 1,
};

describe("transitionObservation maker-checker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses review by the user who raised the observation", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({
        userId: USER_A,
        roles: ["AUDITOR", "AUDIT_MANAGER"],
      }) as never,
    );
    const db = observationDb(USER_A);
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await transitionObservation(REVIEW_INPUT);

    expect(result).toEqual({
      success: false,
      error: "You raised this record; a different user must perform this step.",
    });
    expect(db.observation.updateMany).not.toHaveBeenCalled();
  });

  it("allows review by a different user", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ userId: USER_B, roles: ["AUDIT_MANAGER"] }) as never,
    );
    const db = observationDb(USER_A);
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await transitionObservation(REVIEW_INPUT);

    expect(result).toEqual({
      success: true,
      data: { id: OBSERVATION_A, newStatus: "REVIEWED" },
    });
    expect(db.observation.updateMany).toHaveBeenCalledTimes(1);
  });
});
