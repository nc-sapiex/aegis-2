import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prismaForTenant: vi.fn() }));
vi.mock("@/data-access/audited-mutation", () => ({
  withAuditedMutation: vi.fn(),
  userActor: vi.fn((s: { user: { id: string; tenantId: string } }) => ({
    kind: "user" as const,
    userId: s.user.id,
    tenantId: s.user.tenantId,
  })),
}));

import { confirmRepeatFinding, dismissRepeatFinding } from "../confirm";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/lib/prisma";
import { withAuditedMutation } from "@/data-access/audited-mutation";
import {
  OBSERVATION_A,
  TENANT_A,
  USER_A,
  fakeDb,
  fakeSession,
} from "@/test/factories";

const PRIOR_OBSERVATION = "65656565-6565-4656-8656-656565656565";

function confirmDb() {
  return fakeDb({
    observation: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({
          id: OBSERVATION_A,
          title: "Sanction file missing valuation",
          severity: "MEDIUM",
          version: 1,
          branchId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          auditAreaId: "77777777-7777-4777-8777-777777777777",
        })
        .mockResolvedValueOnce({
          id: PRIOR_OBSERVATION,
          title: "Valuation report absent from sanction file",
          severity: "LOW",
        }),
      count: vi.fn().mockResolvedValue(1),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    observationTimeline: { create: vi.fn().mockResolvedValue({}) },
  });
}

function dismissDb() {
  return fakeDb({
    observation: {
      findFirst: vi.fn().mockResolvedValue({
        id: OBSERVATION_A,
        title: "Sanction file missing valuation",
      }),
    },
    observationTimeline: { create: vi.fn().mockResolvedValue({}) },
  });
}

const CONFIRM_INPUT = {
  observationId: OBSERVATION_A,
  repeatOfId: PRIOR_OBSERVATION,
  version: 1,
};

const DISMISS_INPUT = {
  observationId: OBSERVATION_A,
  repeatOfId: PRIOR_OBSERVATION,
};

describe("confirmRepeatFinding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withAuditedMutation).mockImplementation((async (
      _actor: unknown,
      _action: unknown,
      fn: (tx: unknown) => unknown,
    ) => fn(vi.mocked(prismaForTenant)(TENANT_A))) as never);
  });

  it("persists repeatOfId on the confirmed observation", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["AUDITOR"] }) as never,
    );
    const db = confirmDb();
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await confirmRepeatFinding(CONFIRM_INPUT);

    expect(result.success).toBe(true);
    expect(db.observation.updateMany).toHaveBeenCalledWith({
      where: { id: OBSERVATION_A, tenantId: TENANT_A, version: 1 },
      data: {
        repeatOfId: PRIOR_OBSERVATION,
        severity: "HIGH",
        version: { increment: 1 },
      },
    });
  });

  it("still writes repeatOfId when severity does not escalate", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["AUDITOR"] }) as never,
    );
    const db = confirmDb();
    db.observation.findFirst
      .mockReset()
      .mockResolvedValueOnce({
        id: OBSERVATION_A,
        title: "Sanction file missing valuation",
        severity: "CRITICAL",
        version: 1,
        branchId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        auditAreaId: "77777777-7777-4777-8777-777777777777",
      })
      .mockResolvedValueOnce({
        id: PRIOR_OBSERVATION,
        title: "Valuation report absent from sanction file",
        severity: "LOW",
      });
    db.observation.count.mockResolvedValue(0);
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await confirmRepeatFinding(CONFIRM_INPUT);

    expect(result).toEqual({
      success: true,
      data: {
        id: OBSERVATION_A,
        escalatedSeverity: "CRITICAL",
        wasEscalated: false,
      },
    });
    expect(db.observation.updateMany).toHaveBeenCalledWith({
      where: { id: OBSERVATION_A, tenantId: TENANT_A, version: 1 },
      data: {
        repeatOfId: PRIOR_OBSERVATION,
        version: { increment: 1 },
      },
    });
  });
});

describe("dismissRepeatFinding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withAuditedMutation).mockImplementation((async (
      _actor: unknown,
      _action: unknown,
      fn: (tx: unknown) => unknown,
    ) => fn(vi.mocked(prismaForTenant)(TENANT_A))) as never);
  });

  it("records the dismissal inside withAuditedMutation", async () => {
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["AUDITOR"] }) as never,
    );
    const db = dismissDb();
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await dismissRepeatFinding(DISMISS_INPUT);

    expect(result).toEqual({ success: true });
    expect(withAuditedMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "user",
        userId: USER_A,
        tenantId: TENANT_A,
      }),
      "observation.repeat_dismissed",
      expect.any(Function),
    );
    expect(db.observationTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        observationId: OBSERVATION_A,
        tenantId: TENANT_A,
        event: "repeat_dismissed",
        newValue: PRIOR_OBSERVATION,
        createdById: USER_A,
      }),
    });
  });
});
