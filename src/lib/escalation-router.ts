/**
 * Escalation Router (Phase 2 — R39)
 *
 * Level-specific notification routing logic for compliance escalation.
 * Maps escalation levels to notification types, recipient roles, and message templates.
 *
 * Pure logic module - no side effects, no database access.
 */

import { NotificationType } from "@/generated/prisma/enums";

export type EscalationLevel = 0 | 1 | 2 | 3 | 4;

export interface EscalationRoute {
  level: EscalationLevel;
  notificationType: NotificationType;
  recipientRoles: string[];
  recipientDescription: string;
  urgency: "normal" | "high" | "critical";
  subject: string;
  messageTemplate: string;
}

/**
 * Map escalation level to notification routing configuration.
 *
 * L0: No notification (within SLA)
 * L1 (+15d): DEADLINE_REMINDER email to Branch Head + IAD
 * L2 (+30d): OVERDUE_ESCALATION to Zonal Auditor
 * L3 (+90d): OVERDUE_ESCALATION to ACE Officer
 * L4 (+180d): OVERDUE_ESCALATION to ACB Member + CAE
 */
export function getEscalationRoute(
  level: EscalationLevel,
  itemContext: {
    observationTitle: string;
    branchName: string;
    daysOverdue: number;
  },
): EscalationRoute | null {
  switch (level) {
    case 0:
      return null; // No escalation needed

    case 1:
      return {
        level: 1,
        notificationType: "DEADLINE_REMINDER_7D", // Closest existing type
        recipientRoles: ["BRANCH_HEAD", "AUDITOR", "AUDIT_MANAGER"],
        recipientDescription: "Branch Head + Internal Audit Department",
        urgency: "normal",
        subject: `Compliance overdue: ${itemContext.observationTitle}`,
        messageTemplate: `Compliance item for "${itemContext.observationTitle}" at ${itemContext.branchName} is ${itemContext.daysOverdue} days overdue. Please submit branch response.`,
      };

    case 2:
      return {
        level: 2,
        notificationType: "OVERDUE_ESCALATION",
        recipientRoles: ["ZONAL_AUDITOR"],
        recipientDescription: "Zonal Auditor (ZAC)",
        urgency: "high",
        subject: `ZAC Escalation: ${itemContext.observationTitle} — ${itemContext.daysOverdue}d overdue`,
        messageTemplate: `Compliance item at ${itemContext.branchName} has been overdue for ${itemContext.daysOverdue} days. ZAC review required.`,
      };

    case 3:
      return {
        level: 3,
        notificationType: "OVERDUE_ESCALATION",
        recipientRoles: ["ACE_OFFICER"],
        recipientDescription: "ACE Officer",
        urgency: "high",
        subject: `ACE Escalation: ${itemContext.observationTitle} — ${itemContext.daysOverdue}d overdue`,
        messageTemplate: `Compliance item at ${itemContext.branchName} has been overdue for ${itemContext.daysOverdue} days. Requires ACE quarterly processing.`,
      };

    case 4:
      return {
        level: 4,
        notificationType: "OVERDUE_ESCALATION",
        recipientRoles: ["CAE", "ACB_MEMBER"],
        recipientDescription: "CAE + ACB Members",
        urgency: "critical",
        subject: `ACB Escalation: ${itemContext.observationTitle} — ${itemContext.daysOverdue}d overdue`,
        messageTemplate: `Critical compliance item at ${itemContext.branchName} has been overdue for ${itemContext.daysOverdue} days. Requires ACB board reporting.`,
      };
  }
}

/**
 * Determine if a notification should be sent for this escalation update.
 * Only notify when level increases (not every computation cycle).
 */
export function shouldNotify(
  previousLevel: EscalationLevel,
  newLevel: EscalationLevel,
): boolean {
  return newLevel > previousLevel;
}
