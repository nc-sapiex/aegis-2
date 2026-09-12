/**
 * Engagement State Machine — Pure TypeScript
 *
 * 8-state lifecycle for audit engagements:
 * PLANNED → TEAM_ASSIGNED → OPENING_MEETING → IN_PROGRESS → EXIT_MEETING → REPORT_DRAFT → COMPLETED
 * Any non-terminal state → CANCELLED
 *
 * Role-based transition guards enforce who can trigger each transition.
 * Prerequisite guards enforce RBIA audit practice (meetings before fieldwork,
 * frozen scores before completion, team assignment before audit begins).
 *
 * The typed Record<EngagementStatus, ...> pattern ensures compile-time
 * exhaustiveness — adding a new EngagementStatus value will cause a TypeScript
 * error until the transition map is updated.
 *
 * Zero dependencies beyond Prisma-generated types.
 */

import type { EngagementStatus, Role } from "@/generated/prisma/enums";

// Re-export types for consumers
export type { EngagementStatus, Role };

// ─── Types ──────────────────────────────────────────────────────────────────

export type TransitionResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Context required to evaluate prerequisites for state transitions.
 * Built from the loaded engagement record in the server action.
 */
export type EngagementContext = {
  /** Number of auditors assigned to the engagement (0 blocks TEAM_ASSIGNED transition) */
  teamMemberCount: number;
  /** Whether an opening meeting has been recorded and signed off */
  hasOpeningMeeting: boolean;
  /** Whether an exit meeting has been recorded and signed off */
  hasExitMeeting: boolean;
  /** Whether the BranchRbiaScore has been frozen (frozenAt is set) */
  hasFrozenScore: boolean;
};

/**
 * Definition for a single state transition.
 */
export type EngagementTransitionDef = {
  to: EngagementStatus;
  label: string;
  allowedRoles: Role[];
  prerequisite?: (ctx: EngagementContext) => TransitionResult;
};

// ─── Transition Map ─────────────────────────────────────────────────────────

/**
 * Exhaustive map of all valid engagement state transitions.
 *
 * TypeScript enforces all 8 EngagementStatus keys must be present.
 * Terminal states (COMPLETED, CANCELLED) have empty arrays.
 */
export const ENGAGEMENT_TRANSITIONS: Record<
  EngagementStatus,
  EngagementTransitionDef[]
> = {
  PLANNED: [
    {
      to: "TEAM_ASSIGNED",
      label: "Assign Team",
      allowedRoles: ["CAE", "AUDIT_MANAGER"],
      prerequisite: (ctx) =>
        ctx.teamMemberCount > 0
          ? { allowed: true }
          : {
              allowed: false,
              reason: "At least one auditor must be assigned before proceeding",
            },
    },
    {
      to: "CANCELLED",
      label: "Cancel Engagement",
      allowedRoles: ["CAE", "AUDIT_MANAGER"],
    },
  ],

  TEAM_ASSIGNED: [
    {
      to: "OPENING_MEETING",
      label: "Record Opening Meeting",
      allowedRoles: ["CAE", "AUDIT_MANAGER", "LEAD_AUDITOR"],
    },
    {
      to: "CANCELLED",
      label: "Cancel Engagement",
      allowedRoles: ["CAE", "AUDIT_MANAGER"],
    },
  ],

  OPENING_MEETING: [
    {
      to: "IN_PROGRESS",
      label: "Begin Fieldwork",
      allowedRoles: ["CAE", "AUDIT_MANAGER", "LEAD_AUDITOR"],
      prerequisite: (ctx) =>
        ctx.hasOpeningMeeting
          ? { allowed: true }
          : {
              allowed: false,
              reason:
                "Opening meeting must be recorded and signed off before starting fieldwork",
            },
    },
    {
      to: "CANCELLED",
      label: "Cancel Engagement",
      allowedRoles: ["CAE", "AUDIT_MANAGER"],
    },
  ],

  IN_PROGRESS: [
    {
      to: "EXIT_MEETING",
      label: "Record Exit Meeting",
      allowedRoles: ["CAE", "AUDIT_MANAGER", "LEAD_AUDITOR"],
    },
    {
      to: "CANCELLED",
      label: "Cancel Engagement",
      allowedRoles: ["CAE", "AUDIT_MANAGER"],
    },
  ],

  EXIT_MEETING: [
    {
      to: "REPORT_DRAFT",
      label: "Begin Report Drafting",
      allowedRoles: ["CAE", "AUDIT_MANAGER", "LEAD_AUDITOR"],
      prerequisite: (ctx) =>
        ctx.hasExitMeeting
          ? { allowed: true }
          : {
              allowed: false,
              reason:
                "Exit meeting must be recorded and signed off before drafting the report",
            },
    },
    {
      to: "CANCELLED",
      label: "Cancel Engagement",
      allowedRoles: ["CAE", "AUDIT_MANAGER"],
    },
  ],

  REPORT_DRAFT: [
    {
      to: "COMPLETED",
      label: "Complete Engagement",
      allowedRoles: ["CAE"],
      prerequisite: (ctx) =>
        ctx.hasFrozenScore
          ? { allowed: true }
          : {
              allowed: false,
              reason:
                "Branch RBIA score must be frozen before the engagement can be completed",
            },
    },
    {
      to: "CANCELLED",
      label: "Cancel Engagement",
      allowedRoles: ["CAE", "AUDIT_MANAGER"],
    },
  ],

  // Terminal states — no outgoing transitions
  COMPLETED: [],
  CANCELLED: [],
};

// ─── Core Function ───────────────────────────────────────────────────────────

/**
 * Check if a state transition is allowed given the user's roles and engagement context.
 *
 * @param from - Current engagement status
 * @param to - Target engagement status
 * @param userRoles - Array of roles held by the user (multi-role support)
 * @param ctx - Engagement context for prerequisite evaluation
 * @returns { allowed: true } or { allowed: false, reason: string }
 */
export function canTransitionEngagement(
  from: EngagementStatus,
  to: EngagementStatus,
  userRoles: Role[],
  ctx: EngagementContext,
): TransitionResult {
  const transitions = ENGAGEMENT_TRANSITIONS[from];

  // Find matching transition definition
  const transition = transitions.find((t) => t.to === to);

  if (!transition) {
    return {
      allowed: false,
      reason: `Invalid transition from ${from} to ${to}`,
    };
  }

  // Check role authorization (multi-role: any matching role is sufficient)
  const hasRole = transition.allowedRoles.some((role) =>
    userRoles.includes(role),
  );
  if (!hasRole) {
    return {
      allowed: false,
      reason: `User lacks required role: ${transition.allowedRoles.join(" or ")}`,
    };
  }

  // Check prerequisite guard if defined
  if (transition.prerequisite) {
    const prereqResult = transition.prerequisite(ctx);
    if (!prereqResult.allowed) {
      return prereqResult;
    }
  }

  return { allowed: true };
}
