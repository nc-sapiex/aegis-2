/**
 * Compliance Escalation Engine (Phase 2 — R39)
 *
 * Computes escalation levels for compliance items based on days overdue.
 * Per RBIA Policy:
 * - L0: Within SLA (0-15 days overdue)
 * - L1: +15 days (email to Branch + IAD)
 * - L2: +30 days (ZAC review)
 * - L3: +90 days (ACE quarterly processing)
 * - L4: +180 days (ACB board reporting)
 *
 * Pure functions - no side effects, no database access.
 */

export type EscalationLevel = 0 | 1 | 2 | 3 | 4;

export interface EscalationResult {
  daysOpen: number;
  daysOverdue: number;
  escalationLevel: EscalationLevel;
  shouldNotify: boolean; // True if escalation level just changed
}

/**
 * Signed whole days from `startDate` to `endDate`. Negative when `endDate`
 * is still in the future of `startDate`.
 *
 * Must stay signed: `Math.abs` would treat a due date 30 days away as
 * already 30 days overdue, and the daily escalation job would promote a
 * brand-new ComplianceItem (dueDate = createdAt + 30d) straight to L2.
 */
function daysBetween(startDate: Date, endDate: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay);
}

/**
 * Determine escalation level from days overdue.
 */
function getEscalationLevelFromDays(daysOverdue: number): EscalationLevel {
  if (daysOverdue >= 180) return 4; // L4: ACB
  if (daysOverdue >= 90) return 3; // L3: ACE
  if (daysOverdue >= 30) return 2; // L2: ZAC
  if (daysOverdue >= 15) return 1; // L1: Email
  return 0; // L0: Within grace period
}

/**
 * Compute escalation status for a compliance item.
 *
 * @param createdAt - When the compliance item was created
 * @param dueDate - Original due date (typically createdAt + 30 days)
 * @param currentEscalationLevel - Current escalation level (to detect transitions)
 * @param now - Current timestamp (default: new Date())
 * @returns Escalation result with daysOpen, daysOverdue, level, and shouldNotify flag
 */
export function computeEscalation(
  createdAt: Date,
  dueDate: Date,
  currentEscalationLevel: EscalationLevel,
  now: Date = new Date(),
): EscalationResult {
  // Days since item was created (never negative)
  const daysOpen = Math.max(0, daysBetween(createdAt, now));

  // Days past dueDate; a future due date must clamp to 0, not flip sign
  const daysOverdue = Math.max(0, daysBetween(dueDate, now));

  // New escalation level
  const escalationLevel = getEscalationLevelFromDays(daysOverdue);

  // Should notify if level increased
  const shouldNotify = escalationLevel > currentEscalationLevel;

  return {
    daysOpen,
    daysOverdue,
    escalationLevel,
    shouldNotify,
  };
}

/**
 * Batch compute escalation for multiple items.
 * Returns only items where escalation level changed.
 */
export interface ComplianceItemForEscalation {
  id: string;
  createdAt: Date;
  dueDate: Date;
  escalationLevel: EscalationLevel;
}

export interface EscalationUpdate {
  id: string;
  previousLevel: EscalationLevel;
  newEscalationLevel: EscalationLevel;
  daysOpen: number;
  daysOverdue: number;
  shouldNotify: boolean;
}

/**
 * Get escalation notification targets and action per level (R39).
 */
export function getEscalationRouting(level: EscalationLevel): {
  action: string;
  targets: string[]; // Role names to notify
  emailSubject: string;
} {
  switch (level) {
    case 1:
      return {
        action: "EMAIL_REMINDER",
        targets: ["BRANCH_HEAD", "AUDIT_MANAGER"],
        emailSubject: "Compliance Overdue: 15-Day Escalation Notice",
      };
    case 2:
      return {
        action: "ZAC_REVIEW",
        targets: ["ZONAL_AUDITOR", "AUDIT_MANAGER"],
        emailSubject: "Compliance Overdue: 30-Day ZAC Review Required",
      };
    case 3:
      return {
        action: "ACE_QUARTERLY",
        targets: ["ACE_OFFICER", "CAE"],
        emailSubject: "Compliance Overdue: 90-Day ACE Quarterly Processing",
      };
    case 4:
      return {
        action: "ACB_REPORTING",
        targets: ["ACB_MEMBER", "CAE", "CEO"],
        emailSubject: "Critical: 180-Day ACB Board Escalation",
      };
    default:
      return {
        action: "NONE",
        targets: [],
        emailSubject: "",
      };
  }
}

export function computeBatchEscalation(
  items: ComplianceItemForEscalation[],
  now: Date = new Date(),
): EscalationUpdate[] {
  const updates: EscalationUpdate[] = [];

  for (const item of items) {
    const result = computeEscalation(
      item.createdAt,
      item.dueDate,
      item.escalationLevel,
      now,
    );

    // Only include if escalation level changed or daysOpen changed
    if (result.escalationLevel !== item.escalationLevel) {
      updates.push({
        id: item.id,
        previousLevel: item.escalationLevel,
        newEscalationLevel: result.escalationLevel,
        daysOpen: result.daysOpen,
        daysOverdue: result.daysOverdue,
        shouldNotify: result.shouldNotify,
      });
    }
  }

  return updates;
}
