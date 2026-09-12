"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  UpdateEngagementStatusSchema,
  type UpdateEngagementStatusInput,
} from "./schemas";

const VALID_TRANSITIONS: Record<string, string[]> = {
  PLANNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
};

/**
 * @deprecated Use transitionEngagementStatus instead.
 * This action uses a simplified 3-state transition map that does not cover the
 * full 8-state RBIA engagement lifecycle. It lacks prerequisite guards and
 * role-based checks enforced by the typed state machine.
 */
export async function updateEngagementStatus(
  input: UpdateEngagementStatusInput,
) {
  console.warn(
    "DEPRECATED: updateEngagementStatus called — use transitionEngagementStatus",
  );
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "audit_execution:manage_team")) {
    return {
      success: false as const,
      error: "You do not have permission to update engagement status.",
    };
  }

  const parsed = UpdateEngagementStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0].message };
  }

  const { engagementId, targetStatus } = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    const result = await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: "engagement.status_changed",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      const engagement = await tx.auditEngagement.findFirst({
        where: { id: engagementId, tenantId },
        select: { id: true, status: true },
      });

      if (!engagement) {
        throw new Error("Engagement not found");
      }

      const allowed = VALID_TRANSITIONS[engagement.status];
      if (!allowed || !allowed.includes(targetStatus)) {
        throw new Error(
          `Cannot transition from ${engagement.status} to ${targetStatus}`,
        );
      }

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
        : "Failed to update engagement status.";
    logger.error(
      { error, action: "update_engagement_status", tenantId },
      message,
    );
    return { success: false as const, error: message };
  }
}
