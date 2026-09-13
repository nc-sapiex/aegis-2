import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/data-access/session", () => ({ getRequiredSession: vi.fn() }));
vi.mock("@/data-access/prisma", () => ({ prismaForTenant: vi.fn() }));
vi.mock("@/data-access/audit-context", () => ({ setAuditContext: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { recordMeeting } from "../meetings";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { ENGAGEMENT_A, fakeDb, fakeSession } from "@/test/factories";

const OPENING_INPUT = {
  engagementId: ENGAGEMENT_A,
  meetingType: "OPENING" as const,
  meetingDate: "2026-09-13T10:00:00.000Z",
  attendees: [
    { name: "Asha Rao", role: "LEAD_AUDITOR", designation: "Lead Auditor" },
  ],
};

const EXIT_INPUT = {
  ...OPENING_INPUT,
  meetingType: "EXIT" as const,
};

function meetingDb(status: string) {
  return fakeDb({
    auditEngagement: {
      findFirst: vi.fn().mockResolvedValue({
        id: ENGAGEMENT_A,
        status,
        branchId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        teamMembers: [{ id: "member-1" }],
        meetings: [],
        branchRbiaScore: null,
      }),
      update: vi.fn().mockResolvedValue({ id: ENGAGEMENT_A, status }),
    },
    engagementMeeting: {
      upsert: vi.fn().mockResolvedValue({ id: "meeting-1" }),
    },
  });
}

describe("recordMeeting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRequiredSession).mockResolvedValue(
      fakeSession({ roles: ["CAE"] }) as never,
    );
  });

  it("records an opening meeting when status is already OPENING_MEETING", async () => {
    const db = meetingDb("OPENING_MEETING");
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await recordMeeting(OPENING_INPUT);

    expect(result).toEqual({
      success: true,
      data: { status: "OPENING_MEETING" },
    });
    expect(db.engagementMeeting.upsert).toHaveBeenCalledTimes(1);
    expect(db.auditEngagement.update).not.toHaveBeenCalled();
  });

  it("records an exit meeting when status is already EXIT_MEETING", async () => {
    const db = meetingDb("EXIT_MEETING");
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await recordMeeting(EXIT_INPUT);

    expect(result).toEqual({
      success: true,
      data: { status: "EXIT_MEETING" },
    });
    expect(db.engagementMeeting.upsert).toHaveBeenCalledTimes(1);
    expect(db.auditEngagement.update).not.toHaveBeenCalled();
  });

  it("still transitions TEAM_ASSIGNED to OPENING_MEETING when recording", async () => {
    const db = meetingDb("TEAM_ASSIGNED");
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await recordMeeting(OPENING_INPUT);

    expect(result).toEqual({
      success: true,
      data: { status: "OPENING_MEETING" },
    });
    expect(db.auditEngagement.update).toHaveBeenCalledWith({
      where: { id: ENGAGEMENT_A },
      data: { status: "OPENING_MEETING" },
    });
  });

  it("still rejects recording an opening meeting from IN_PROGRESS", async () => {
    const db = meetingDb("IN_PROGRESS");
    vi.mocked(prismaForTenant).mockReturnValue(db);

    const result = await recordMeeting(OPENING_INPUT);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("TRANSITION_BLOCKED");
      expect(result.error).toMatch(/IN_PROGRESS.*OPENING_MEETING/);
    }
    expect(db.engagementMeeting.upsert).not.toHaveBeenCalled();
  });
});
