import { describe, it, expect } from "vitest";
import {
  canTransitionEngagement,
  ENGAGEMENT_TRANSITIONS,
  type EngagementContext,
} from "@/lib/engagement-state-machine";
import type { EngagementStatus } from "@/generated/prisma/enums";

// ─── Default context (all prerequisites met) ────────────────────────────────

const defaultCtx: EngagementContext = {
  teamMemberCount: 1,
  hasOpeningMeeting: true,
  hasExitMeeting: true,
  hasFrozenScore: true,
};

// ─── Transition validity tests ───────────────────────────────────────────────

describe("canTransitionEngagement — valid forward transitions", () => {
  it("PLANNED -> TEAM_ASSIGNED: allowed for CAE", () => {
    const result = canTransitionEngagement(
      "PLANNED",
      "TEAM_ASSIGNED",
      ["CAE"],
      defaultCtx,
    );
    expect(result).toEqual({ allowed: true });
  });

  it("PLANNED -> TEAM_ASSIGNED: allowed for AUDIT_MANAGER", () => {
    const result = canTransitionEngagement(
      "PLANNED",
      "TEAM_ASSIGNED",
      ["AUDIT_MANAGER"],
      defaultCtx,
    );
    expect(result).toEqual({ allowed: true });
  });

  it("TEAM_ASSIGNED -> OPENING_MEETING: allowed for CAE", () => {
    const result = canTransitionEngagement(
      "TEAM_ASSIGNED",
      "OPENING_MEETING",
      ["CAE"],
      defaultCtx,
    );
    expect(result).toEqual({ allowed: true });
  });

  it("TEAM_ASSIGNED -> OPENING_MEETING: allowed for AUDIT_MANAGER", () => {
    const result = canTransitionEngagement(
      "TEAM_ASSIGNED",
      "OPENING_MEETING",
      ["AUDIT_MANAGER"],
      defaultCtx,
    );
    expect(result).toEqual({ allowed: true });
  });

  it("TEAM_ASSIGNED -> OPENING_MEETING: allowed for LEAD_AUDITOR", () => {
    const result = canTransitionEngagement(
      "TEAM_ASSIGNED",
      "OPENING_MEETING",
      ["LEAD_AUDITOR"],
      defaultCtx,
    );
    expect(result).toEqual({ allowed: true });
  });

  it("OPENING_MEETING -> IN_PROGRESS: allowed when hasOpeningMeeting=true", () => {
    const result = canTransitionEngagement(
      "OPENING_MEETING",
      "IN_PROGRESS",
      ["CAE"],
      { ...defaultCtx, hasOpeningMeeting: true },
    );
    expect(result).toEqual({ allowed: true });
  });

  it("IN_PROGRESS -> EXIT_MEETING: allowed for CAE", () => {
    const result = canTransitionEngagement(
      "IN_PROGRESS",
      "EXIT_MEETING",
      ["CAE"],
      defaultCtx,
    );
    expect(result).toEqual({ allowed: true });
  });

  it("IN_PROGRESS -> EXIT_MEETING: allowed for AUDIT_MANAGER", () => {
    const result = canTransitionEngagement(
      "IN_PROGRESS",
      "EXIT_MEETING",
      ["AUDIT_MANAGER"],
      defaultCtx,
    );
    expect(result).toEqual({ allowed: true });
  });

  it("IN_PROGRESS -> EXIT_MEETING: allowed for LEAD_AUDITOR", () => {
    const result = canTransitionEngagement(
      "IN_PROGRESS",
      "EXIT_MEETING",
      ["LEAD_AUDITOR"],
      defaultCtx,
    );
    expect(result).toEqual({ allowed: true });
  });

  it("EXIT_MEETING -> REPORT_DRAFT: allowed when hasExitMeeting=true", () => {
    const result = canTransitionEngagement(
      "EXIT_MEETING",
      "REPORT_DRAFT",
      ["CAE"],
      { ...defaultCtx, hasExitMeeting: true },
    );
    expect(result).toEqual({ allowed: true });
  });

  it("REPORT_DRAFT -> COMPLETED: allowed when hasFrozenScore=true, only for CAE", () => {
    const result = canTransitionEngagement(
      "REPORT_DRAFT",
      "COMPLETED",
      ["CAE"],
      { ...defaultCtx, hasFrozenScore: true },
    );
    expect(result).toEqual({ allowed: true });
  });
});

describe("canTransitionEngagement — CANCELLED transitions", () => {
  const nonTerminalStates: EngagementStatus[] = [
    "PLANNED",
    "TEAM_ASSIGNED",
    "OPENING_MEETING",
    "IN_PROGRESS",
    "EXIT_MEETING",
    "REPORT_DRAFT",
  ];

  for (const state of nonTerminalStates) {
    it(`${state} -> CANCELLED: allowed for CAE`, () => {
      const result = canTransitionEngagement(
        state,
        "CANCELLED",
        ["CAE"],
        defaultCtx,
      );
      expect(result).toEqual({ allowed: true });
    });

    it(`${state} -> CANCELLED: allowed for AUDIT_MANAGER`, () => {
      const result = canTransitionEngagement(
        state,
        "CANCELLED",
        ["AUDIT_MANAGER"],
        defaultCtx,
      );
      expect(result).toEqual({ allowed: true });
    });
  }
});

// ─── Prerequisite guard tests ────────────────────────────────────────────────

describe("canTransitionEngagement — prerequisite guards", () => {
  it("PLANNED -> TEAM_ASSIGNED: rejected when teamMemberCount=0", () => {
    const result = canTransitionEngagement(
      "PLANNED",
      "TEAM_ASSIGNED",
      ["CAE"],
      { ...defaultCtx, teamMemberCount: 0 },
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toMatch(/auditor must be assigned/i);
    }
  });

  it("OPENING_MEETING -> IN_PROGRESS: rejected when hasOpeningMeeting=false", () => {
    const result = canTransitionEngagement(
      "OPENING_MEETING",
      "IN_PROGRESS",
      ["CAE"],
      { ...defaultCtx, hasOpeningMeeting: false },
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBeDefined();
    }
  });

  it("EXIT_MEETING -> REPORT_DRAFT: rejected when hasExitMeeting=false", () => {
    const result = canTransitionEngagement(
      "EXIT_MEETING",
      "REPORT_DRAFT",
      ["CAE"],
      { ...defaultCtx, hasExitMeeting: false },
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBeDefined();
    }
  });

  it("REPORT_DRAFT -> COMPLETED: rejected when hasFrozenScore=false", () => {
    const result = canTransitionEngagement(
      "REPORT_DRAFT",
      "COMPLETED",
      ["CAE"],
      { ...defaultCtx, hasFrozenScore: false },
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBeDefined();
    }
  });
});

// ─── Role guard tests ────────────────────────────────────────────────────────

describe("canTransitionEngagement — role guards", () => {
  it("PLANNED -> TEAM_ASSIGNED: rejected for AUDITOR role", () => {
    const result = canTransitionEngagement(
      "PLANNED",
      "TEAM_ASSIGNED",
      ["AUDITOR"],
      defaultCtx,
    );
    expect(result.allowed).toBe(false);
  });

  it("REPORT_DRAFT -> COMPLETED: rejected for AUDIT_MANAGER (only CAE can complete)", () => {
    const result = canTransitionEngagement(
      "REPORT_DRAFT",
      "COMPLETED",
      ["AUDIT_MANAGER"],
      defaultCtx,
    );
    expect(result.allowed).toBe(false);
  });

  it("multi-role user [CAE, AUDIT_MANAGER] can transition PLANNED -> TEAM_ASSIGNED", () => {
    const result = canTransitionEngagement(
      "PLANNED",
      "TEAM_ASSIGNED",
      ["CAE", "AUDIT_MANAGER"],
      defaultCtx,
    );
    expect(result).toEqual({ allowed: true });
  });

  it("LEAD_AUDITOR cannot cancel (only CAE and AUDIT_MANAGER can)", () => {
    const result = canTransitionEngagement(
      "IN_PROGRESS",
      "CANCELLED",
      ["LEAD_AUDITOR"],
      defaultCtx,
    );
    expect(result.allowed).toBe(false);
  });
});

// ─── Invalid transition tests ────────────────────────────────────────────────

describe("canTransitionEngagement — invalid transitions", () => {
  it("PLANNED -> IN_PROGRESS: rejected (cannot skip states)", () => {
    const result = canTransitionEngagement(
      "PLANNED",
      "IN_PROGRESS",
      ["CAE"],
      defaultCtx,
    );
    expect(result.allowed).toBe(false);
  });

  it("COMPLETED -> PLANNED: rejected (terminal state)", () => {
    const result = canTransitionEngagement(
      "COMPLETED",
      "PLANNED",
      ["CAE"],
      defaultCtx,
    );
    expect(result.allowed).toBe(false);
  });

  it("COMPLETED -> IN_PROGRESS: rejected (terminal state)", () => {
    const result = canTransitionEngagement(
      "COMPLETED",
      "IN_PROGRESS",
      ["CAE"],
      defaultCtx,
    );
    expect(result.allowed).toBe(false);
  });

  it("CANCELLED -> PLANNED: rejected (terminal state)", () => {
    const result = canTransitionEngagement(
      "CANCELLED",
      "PLANNED",
      ["CAE"],
      defaultCtx,
    );
    expect(result.allowed).toBe(false);
  });

  it("CANCELLED -> IN_PROGRESS: rejected (terminal state)", () => {
    const result = canTransitionEngagement(
      "CANCELLED",
      "IN_PROGRESS",
      ["CAE"],
      defaultCtx,
    );
    expect(result.allowed).toBe(false);
  });

  it("IN_PROGRESS -> PLANNED: rejected (no backward transitions)", () => {
    const result = canTransitionEngagement(
      "IN_PROGRESS",
      "PLANNED",
      ["CAE"],
      defaultCtx,
    );
    expect(result.allowed).toBe(false);
  });
});

// ─── Terminal state tests ────────────────────────────────────────────────────

describe("canTransitionEngagement — terminal states", () => {
  it("COMPLETED has empty transitions array", () => {
    expect(ENGAGEMENT_TRANSITIONS["COMPLETED"]).toEqual([]);
  });

  it("CANCELLED has empty transitions array", () => {
    expect(ENGAGEMENT_TRANSITIONS["CANCELLED"]).toEqual([]);
  });
});

// ─── Exhaustiveness test ─────────────────────────────────────────────────────

describe("ENGAGEMENT_TRANSITIONS", () => {
  it("has keys for all 8 EngagementStatus values", () => {
    const expectedStatuses: EngagementStatus[] = [
      "PLANNED",
      "TEAM_ASSIGNED",
      "OPENING_MEETING",
      "IN_PROGRESS",
      "EXIT_MEETING",
      "REPORT_DRAFT",
      "COMPLETED",
      "CANCELLED",
    ];
    const actualKeys = Object.keys(ENGAGEMENT_TRANSITIONS);
    expect(actualKeys.sort()).toEqual(expectedStatuses.sort());
  });

  it("every non-terminal state has at least one transition", () => {
    const terminalStates: EngagementStatus[] = ["COMPLETED", "CANCELLED"];
    for (const [status, defs] of Object.entries(ENGAGEMENT_TRANSITIONS)) {
      if (!terminalStates.includes(status as EngagementStatus)) {
        expect(defs.length).toBeGreaterThan(0);
      }
    }
  });
});
