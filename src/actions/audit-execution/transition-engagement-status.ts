"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  canTransitionEngagement,
  type EngagementContext,
} from "@/lib/engagement-state-machine";

// ─── Schema ──────────────────────────────────────────────────────────────────

const TransitionEngagementStatusSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  targetStatus: z.enum(
    [
      "TEAM_ASSIGNED",
      "OPENING_MEETING",
      "IN_PROGRESS",
      "EXIT_MEETING",
      "REPORT_DRAFT",
      "COMPLETED",
      "CANCELLED",
    ],
    { message: "Invalid target status" },
  ),
});

type TransitionEngagementStatusInput = z.infer<
  typeof TransitionEngagementStatusSchema
>;

// ─── Server Action ────────────────────────────────────────────────────────────

/**
 * Transition an audit engagement's status using the typed state machine.
 *
 * Security: Requires audit_execution:manage_team permission.
 * Validates: Role-based guards and prerequisite checks via canTransitionEngagement().
 * Side effects: Sets actualStartDate on IN_PROGRESS, actualEndDate on COMPLETED.
 */
export async function transitionEngagementStatus(
  input: TransitionEngagementStatusInput,
) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "audit_execution:manage_team")) {
    return {
      success: false as const,
      error: "You do not have permission to update engagement status.",
    };
  }

  const parsed = TransitionEngagementStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const { engagementId, targetStatus } = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    const result = await db.$transaction(async (tx: any) => {
      // Load engagement with all prerequisite data
      const engagement = await tx.auditEngagement.findFirst({
        where: { id: engagementId, tenantId },
        select: {
          id: true,
          status: true,
          teamMembers: {
            select: { id: true },
          },
          meetings: {
            select: { meetingType: true, signedOff: true },
          },
          branchRbiaScore: {
            select: { frozenAt: true },
          },
        },
      });

      if (!engagement) {
        throw new Error("Engagement not found");
      }

      // Build engagement context from loaded data
      const ctx: EngagementContext = {
        teamMemberCount: engagement.teamMembers.length,
        hasOpeningMeeting: engagement.meetings.some(
          (m: { meetingType: string; signedOff: boolean }) =>
            m.meetingType === "OPENING" && m.signedOff,
        ),
        hasExitMeeting: engagement.meetings.some(
          (m: { meetingType: string; signedOff: boolean }) =>
            m.meetingType === "EXIT" && m.signedOff,
        ),
        hasFrozenScore:
          engagement.branchRbiaScore !== null &&
          engagement.branchRbiaScore?.frozenAt !== null,
      };

      // Validate transition using state machine
      const transitionResult = canTransitionEngagement(
        engagement.status,
        targetStatus,
        userRoles,
        ctx,
      );

      if (!transitionResult.allowed) {
        throw new Error(transitionResult.reason);
      }

      // Set audit context for audit trail
      await setAuditContext(tx, {
        actionType: "engagement.status_changed",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // Build update payload
      const updateData: Record<string, unknown> = {
        status: targetStatus,
      };

      if (targetStatus === "IN_PROGRESS") {
        updateData.actualStartDate = new Date();
      } else if (targetStatus === "COMPLETED") {
        updateData.actualEndDate = new Date();
      }

      return tx.auditEngagement.update({
        where: { id: engagementId },
        data: updateData,
      });
    });

    revalidatePath("/audit-execution");
    revalidatePath(`/audit-execution/${engagementId}`);

    return {
      success: true as const,
      data: { id: result.id, status: targetStatus },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to transition engagement status.";
    logger.error(
      { error, action: "transition_engagement_status", tenantId },
      message,
    );
    return { success: false as const, error: message };
  }
}
