"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  TransitionReportSchema,
  REPORT_TRANSITIONS,
  TRANSITION_ROLES,
  type ReportStatus,
} from "./schemas";
import type { TransitionReportInput } from "./schemas";
import { checkReportTransition } from "@/lib/maker-checker";

/**
 * Server action for report state transitions (R33).
 *
 * Transitions: DRAFT → REVIEWED → APPROVED → ISSUED
 * Each transition is role-gated and validates pre-conditions.
 *
 * Pre-conditions:
 * - DRAFT → REVIEWED: At least one observation must exist
 * - APPROVED → ISSUED: BH certificate must be signed
 *
 * @returns { success, data?, error? } — never throws
 */
export async function transitionReportStatus(input: TransitionReportInput) {
  // ─── Step 1: Authentication ────────────────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // ─── Step 2: Input Validation ──────────────────────────────────
  const parsed = TransitionReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }

  const validated = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    // ─── Step 3: Fetch current engagement ──────────────────────────
    const engagement = await db.auditEngagement.findFirst({
      where: {
        id: validated.engagementId,
        tenantId,
      },
      select: {
        id: true,
        reportStatus: true,
        bhCertSignedAt: true,
        reportReviewedById: true,
        reportApprovedById: true,
        observations: {
          select: { id: true },
        },
      },
    });

    if (!engagement) {
      return {
        success: false as const,
        error: "Engagement not found.",
      };
    }

    const currentStatus = (engagement.reportStatus ?? "DRAFT") as ReportStatus;
    const targetStatus = validated.targetStatus;

    // ─── Step 4: Validate transition is allowed ────────────────────
    const allowedTargets = REPORT_TRANSITIONS[currentStatus];
    if (!allowedTargets.includes(targetStatus)) {
      return {
        success: false as const,
        error: `Cannot transition from ${currentStatus} to ${targetStatus}.`,
      };
    }

    // ─── Step 5: Validate role is allowed ──────────────────────────
    const transitionKey = `${currentStatus}→${targetStatus}`;
    const requiredRoles = TRANSITION_ROLES[transitionKey];

    if (!requiredRoles) {
      return {
        success: false as const,
        error: `Invalid transition: ${transitionKey}.`,
      };
    }

    const hasRequiredRole = userRoles.some((role) =>
      requiredRoles.includes(role),
    );

    if (!hasRequiredRole) {
      return {
        success: false as const,
        error: `You do not have permission to perform this transition. Required roles: ${requiredRoles.join(", ")}.`,
      };
    }

    // ─── Step 5b: Maker-checker ────────────────────────────────────
    // The reviewer may neither approve nor issue. The approver may issue,
    // because only CAE can issue and a bank may hold exactly one.
    const makerChecker = checkReportTransition(
      currentStatus,
      targetStatus,
      session.user.id,
      { reportReviewedById: engagement.reportReviewedById },
    );

    if (!makerChecker.allowed) {
      return {
        success: false as const,
        error: makerChecker.reason,
      };
    }

    // ─── Step 6: Pre-condition checks ──────────────────────────────
    // DRAFT → REVIEWED: Requires at least one observation
    if (currentStatus === "DRAFT" && targetStatus === "REVIEWED") {
      if (engagement.observations.length === 0) {
        return {
          success: false as const,
          error:
            "Cannot mark report as reviewed: At least one observation must exist.",
        };
      }
    }

    // APPROVED → ISSUED: Requires BH certificate to be signed
    if (currentStatus === "APPROVED" && targetStatus === "ISSUED") {
      if (!engagement.bhCertSignedAt) {
        return {
          success: false as const,
          error:
            "Cannot issue report: Branch Head certificate must be signed first.",
        };
      }
    }

    // ─── Step 7: Transaction — Update engagement ───────────────────
    const result = await db.$transaction(async (tx: any) => {
      // Set audit context for AuditLog trigger
      await setAuditContext(tx, {
        actionType: "report.transitioned",
        justification: validated.comments,
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      const updateData: Record<string, any> = {
        reportStatus: targetStatus,
      };

      // Set appropriate timestamp and user ID based on target status
      const now = new Date();
      switch (targetStatus) {
        case "REVIEWED":
          updateData.reportReviewedById = session.user.id;
          updateData.reportReviewedAt = now;
          break;
        case "APPROVED":
          updateData.reportApprovedById = session.user.id;
          updateData.reportApprovedAt = now;
          break;
        case "ISSUED":
          updateData.reportIssuedById = session.user.id;
          updateData.reportIssuedAt = now;
          break;
        case "DRAFT":
          // When sent back to DRAFT, clear review/approval fields
          updateData.reportReviewedById = null;
          updateData.reportReviewedAt = null;
          updateData.reportApprovedById = null;
          updateData.reportApprovedAt = null;
          updateData.reportIssuedById = null;
          updateData.reportIssuedAt = null;
          break;
      }

      // Update engagement with tenant scope
      // Update by id only (tenant already verified by findFirst above)
      await tx.auditEngagement.update({
        where: { id: validated.engagementId },
        data: updateData,
      });

      return {
        newStatus: targetStatus,
        transitionedBy: session.user.id,
        transitionedAt: now,
      };
    });

    // ─── Step 8: Cache Revalidation ────────────────────────────────
    revalidatePath(`/audit-execution/${validated.engagementId}/report`);
    revalidatePath(`/audit-execution/${validated.engagementId}`);

    // ─── Step 9: Success Response ──────────────────────────────────
    return {
      success: true as const,
      data: result,
    };
  } catch (error) {
    // ─── Step 10: Error Handling ───────────────────────────────────
    logger.error(
      {
        error,
        action: "transition_report_status",
        tenantId,
        engagementId: validated.engagementId,
      },
      "Failed to transition report status",
    );

    return {
      success: false as const,
      error: "Failed to transition report status. Please try again.",
    };
  }
}
