/**
 * Observation State Machine — Pure TypeScript
 *
 * 7-state lifecycle for audit observations:
 * DRAFT → SUBMITTED → REVIEWED → ISSUED → RESPONSE → COMPLIANCE → CLOSED
 *
 * Role-based transition guards enforce who can trigger which transitions.
 * Severity-based closing: AUDIT_MANAGER for LOW/MEDIUM, CAE for HIGH/CRITICAL.
 *
 * Zero dependencies beyond Prisma-generated types.
 */

import type {
  ObservationStatus,
  Role,
  Severity,
} from "@/generated/prisma/enums";

// Re-export types for consumers
export type { ObservationStatus, Role, Severity };

// ─── Types ──────────────────────────────────────────────────────────────────

export type TransitionResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export type AvailableTransition = {
  to: ObservationStatus;
  label: string;
};

export type TransitionDef = {
  from: ObservationStatus;
  to: ObservationStatus;
  allowedRoles: Role[];
  label: string;
  severityGuard?: (severity: Severity | undefined, roles: Role[]) => boolean;
};

// ─── Transition Definitions ─────────────────────────────────────────────────

/**
 * Roles that can author an observation — the roles granted `observation:create`
 * in src/lib/permissions.ts (AUDITOR plus the specialised auditor roles).
 *
 * Every author submits their own draft for review — that is the maker step of
 * maker-checker — so the DRAFT → SUBMITTED transition is open to all of them,
 * not just AUDITOR. A role that can create an observation but not submit it
 * would strand its drafts in DRAFT with no available action (the detail page
 * even tells the user to "submit for review" while showing no button).
 *
 * Kept in sync with ROLE_PERMISSIONS by
 * src/lib/__tests__/observation-author-roles.test.ts, which fails the build if
 * a role gains `observation:create` without also being able to submit.
 */
export const OBSERVATION_AUTHOR_ROLES: Role[] = [
  "AUDITOR",
  "LEAD_AUDITOR",
  "FIELD_AUDITOR",
  "CONCURRENT_AUDITOR",
  "IS_AUDITOR",
];

/**
 * All valid transitions in the observation lifecycle.
 * 6 forward transitions + 2 return transitions = 8 total.
 */
export const TRANSITIONS: TransitionDef[] = [
  // Forward flow
  {
    from: "DRAFT",
    to: "SUBMITTED",
    allowedRoles: OBSERVATION_AUTHOR_ROLES,
    label: "Submit for Review",
  },
  {
    from: "SUBMITTED",
    to: "REVIEWED",
    allowedRoles: ["AUDIT_MANAGER"],
    label: "Approve",
  },
  {
    from: "REVIEWED",
    to: "ISSUED",
    allowedRoles: ["AUDIT_MANAGER"],
    label: "Issue to Auditee",
  },
  {
    from: "ISSUED",
    to: "RESPONSE",
    allowedRoles: ["AUDITEE"],
    label: "Respond to Observation",
  },
  {
    from: "RESPONSE",
    to: "COMPLIANCE",
    allowedRoles: ["AUDITOR", "AUDIT_MANAGER"],
    label: "Mark Compliance",
  },
  {
    from: "COMPLIANCE",
    to: "CLOSED",
    allowedRoles: ["AUDIT_MANAGER", "CAE"],
    label: "Close Observation",
    severityGuard: (severity, roles) => {
      if (!severity) return false;
      const isCAE = roles.includes("CAE");
      if (severity === "HIGH" || severity === "CRITICAL") {
        return isCAE;
      }
      // LOW/MEDIUM: AUDIT_MANAGER or CAE can close
      return true;
    },
  },
  // Return transitions (maker-checker)
  {
    from: "SUBMITTED",
    to: "DRAFT",
    allowedRoles: ["AUDIT_MANAGER"],
    label: "Return to Draft",
  },
  {
    from: "REVIEWED",
    to: "SUBMITTED",
    allowedRoles: ["AUDIT_MANAGER"],
    label: "Return for Re-review",
  },
];

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Check if a state transition is allowed given the user's roles and observation severity.
 *
 * @param from - Current observation status
 * @param to - Target observation status
 * @param userRoles - Array of roles held by the user (multi-role support, D20)
 * @param severity - Observation severity (required for COMPLIANCE -> CLOSED)
 * @returns { allowed: true } or { allowed: false, reason: string }
 */
export function canTransition(
  from: ObservationStatus,
  to: ObservationStatus,
  userRoles: Role[],
  severity?: Severity,
): TransitionResult {
  // Find matching transition definition
  const transition = TRANSITIONS.find((t) => t.from === from && t.to === to);

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

  // Check severity guard (only for COMPLIANCE -> CLOSED)
  if (transition.severityGuard) {
    if (!severity) {
      return {
        allowed: false,
        reason: "Severity is required to close an observation",
      };
    }
    const passes = transition.severityGuard(severity, userRoles);
    if (!passes) {
      return {
        allowed: false,
        reason: `${severity} severity requires CAE to close`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Get all available transitions for the current state, roles, and severity.
 *
 * @param currentState - Current observation status
 * @param userRoles - Array of roles held by the user
 * @param severity - Observation severity (used for closing guard)
 * @returns Array of available transitions with labels for UI rendering
 */
export function getAvailableTransitions(
  currentState: ObservationStatus,
  userRoles: Role[],
  severity?: Severity,
): AvailableTransition[] {
  return TRANSITIONS.filter((t) => {
    if (t.from !== currentState) return false;

    const result = canTransition(t.from, t.to, userRoles, severity);
    return result.allowed;
  }).map((t) => ({
    to: t.to,
    label: t.label,
  }));
}

// ─── Severity Escalation ────────────────────────────────────────────────────

const SEVERITY_LEVELS: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/**
 * Calculate escalated severity based on occurrence count (OBS-10).
 *
 * Rules:
 * - 1st occurrence: no escalation (keep current severity)
 * - 2nd occurrence: escalate +1 level (LOW→MEDIUM, MEDIUM→HIGH, HIGH→CRITICAL)
 * - 3rd+ occurrence: always CRITICAL
 * - CRITICAL stays CRITICAL (already max)
 *
 * @param currentSeverity - Current severity level
 * @param occurrenceCount - Number of times this finding has occurred
 * @returns Escalated severity level
 */
export function escalateSeverity(
  currentSeverity: Severity,
  occurrenceCount: number,
): Severity {
  // 3rd+ occurrence: always CRITICAL
  if (occurrenceCount >= 3) return "CRITICAL";

  // 1st occurrence: no escalation
  if (occurrenceCount <= 1) return currentSeverity;

  // 2nd occurrence: +1 level
  const currentIndex = SEVERITY_LEVELS.indexOf(currentSeverity);
  const nextIndex = Math.min(currentIndex + 1, SEVERITY_LEVELS.length - 1);
  return SEVERITY_LEVELS[nextIndex];
}
