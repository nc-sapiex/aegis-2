"use server";

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
import {
  RecordMeetingSchema,
  SignOffMeetingSchema,
  type RecordMeetingInput,
  type SignOffMeetingInput,
  type ActionResult,
} from "./schemas";

// ─── recordMeeting ──────────────────────────────────────────────────────────

/**
 * Atomically record an engagement meeting AND transition the engagement status.
 *
 * Recording an opening meeting transitions to OPENING_MEETING.
 * Recording an exit meeting transitions to EXIT_MEETING.
 * Both happen inside a single $transaction — no partial state.
 *
 * Security: Requires audit_execution:manage_team permission.
 * Validation: State machine guards reject invalid transitions.
 * Audit: Sets audit context before mutations for audit trail.
 */
export async function recordMeeting(
  input: RecordMeetingInput,
): Promise<ActionResult<{ status: string }>> {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // 1. Permission check
  if (!hasPermission(userRoles, "audit_execution:manage_team")) {
    return {
      success: false,
      error: "You do not have permission to record meetings.",
      code: "PERMISSION_DENIED",
    };
  }

  // 2. Validate input
  const parsed = RecordMeetingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0].message,
      code: "VALIDATION_ERROR",
    };
  }
  const validated = parsed.data;

  // 3. Get Prisma client
  const db = prismaForTenant(tenantId);

  try {
    const result = await db.$transaction(async (tx: any) => {
      // a. Set audit context before mutations
      await setAuditContext(tx, {
        actionType: "engagement_meeting.recorded",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // b. Load engagement with prerequisites
      const engagement = await tx.auditEngagement.findFirst({
        where: { id: validated.engagementId, tenantId },
        select: {
          id: true,
          status: true,
          branchId: true,
          teamMembers: { select: { id: true } },
          meetings: { select: { meetingType: true, signedOff: true } },
          branchRbiaScore: { select: { frozenAt: true } },
        },
      });
      if (!engagement) {
        throw new Error("Engagement not found");
      }

      // c. Determine target status based on meeting type
      const targetStatus =
        validated.meetingType === "OPENING"
          ? "OPENING_MEETING"
          : "EXIT_MEETING";

      // d. Build EngagementContext and validate transition via state machine
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
      const transitionResult = canTransitionEngagement(
        engagement.status,
        targetStatus,
        userRoles,
        ctx,
      );
      if (!transitionResult.allowed) {
        throw new TransitionBlockedError(transitionResult.reason);
      }

      // e. Upsert meeting record
      await tx.engagementMeeting.upsert({
        where: {
          engagementId_meetingType: {
            engagementId: validated.engagementId,
            meetingType: validated.meetingType,
          },
        },
        create: {
          tenantId,
          engagementId: validated.engagementId,
          meetingType: validated.meetingType,
          meetingDate: new Date(validated.meetingDate),
          attendees: validated.attendees as any,
          minutesText: validated.minutesText ?? null,
          keyDiscussionPoints: validated.keyDiscussionPoints ?? null,
          signedOff: false,
        },
        update: {
          meetingDate: new Date(validated.meetingDate),
          attendees: validated.attendees as any,
          minutesText: validated.minutesText ?? null,
          keyDiscussionPoints: validated.keyDiscussionPoints ?? null,
        },
      });

      // f. Transition engagement status
      await tx.auditEngagement.update({
        where: { id: validated.engagementId },
        data: { status: targetStatus },
      });

      return { status: targetStatus };
    });

    // Revalidate relevant paths
    revalidatePath(`/audit-execution/${validated.engagementId}/rbia`);
    revalidatePath(`/audit-execution`);

    return { success: true as const, data: { status: result.status } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to record meeting.";
    const code =
      error instanceof TransitionBlockedError
        ? "TRANSITION_BLOCKED"
        : "INTERNAL_ERROR";

    logger.error({ error, action: "record_meeting", tenantId }, message);

    return { success: false, error: message, code } as ActionResult<{
      status: string;
    }>;
  }
}

// ─── signOffMeeting ─────────────────────────────────────────────────────────

/**
 * Sign off an existing meeting record — sets signedOff=true.
 *
 * Sign-off is a prerequisite for the NEXT engagement status transition:
 * - Signed opening meeting required before IN_PROGRESS
 * - Signed exit meeting required before REPORT_DRAFT
 *
 * Security: Requires audit_execution:manage_team permission.
 * Idempotent: Returns success with alreadySignedOff flag if already signed.
 */
export async function signOffMeeting(
  input: SignOffMeetingInput,
): Promise<ActionResult<{ signedOff: true }>> {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // 1. Permission check
  if (!hasPermission(userRoles, "audit_execution:manage_team")) {
    return {
      success: false,
      error: "You do not have permission to sign off meetings.",
      code: "PERMISSION_DENIED",
    };
  }

  // 2. Validate input
  const parsed = SignOffMeetingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0].message,
      code: "VALIDATION_ERROR",
    };
  }
  const validated = parsed.data;

  // 3. Get Prisma client
  const db = prismaForTenant(tenantId);

  try {
    await db.$transaction(async (tx: any) => {
      // a. Set audit context before mutations
      await setAuditContext(tx, {
        actionType: "engagement_meeting.signed_off",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // b. Load the meeting record
      const meeting = await tx.engagementMeeting.findUnique({
        where: {
          engagementId_meetingType: {
            engagementId: validated.engagementId,
            meetingType: validated.meetingType,
          },
        },
      });
      if (!meeting) {
        throw new Error("Meeting not found — record the meeting first");
      }
      if (meeting.tenantId !== tenantId) {
        throw new Error("Meeting not found");
      }
      if (meeting.signedOff) {
        // Already signed off — idempotent success
        return;
      }

      // c. Update meeting with sign-off
      await tx.engagementMeeting.update({
        where: { id: meeting.id },
        data: {
          signedOff: true,
          signedOffById: session.user.id,
          signedOffAt: new Date(),
        },
      });
    });

    // Revalidate relevant paths
    revalidatePath(`/audit-execution/${validated.engagementId}/rbia`);

    return { success: true as const, data: { signedOff: true } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sign off meeting.";

    logger.error({ error, action: "sign_off_meeting", tenantId }, message);

    return {
      success: false,
      error: message,
      code: "INTERNAL_ERROR",
    } as ActionResult<{ signedOff: true }>;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Custom error class to distinguish state machine rejections from generic errors.
 * Caught in the error handler to return TRANSITION_BLOCKED code.
 */
class TransitionBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "TransitionBlockedError";
  }
}
