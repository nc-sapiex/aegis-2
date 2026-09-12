"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { ZacReviewSchema, type ZacReviewInput } from "./schemas";

/**
 * ZAC review of branch response.
 * Security: Requires compliance:zac_review permission (ZONAL_AUDITOR).
 * Atomicity: Updates ComplianceItem with ZAC decision in transaction.
 * Side effects: Transitions to ZAC_APPROVED, ZAC_REJECTED, or keeps in BRANCH_RESPONSE_SUBMITTED.
 */
export async function zacReviewCompliance(input: ZacReviewInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "compliance:zac_review")) {
    return {
      success: false as const,
      error: "You do not have permission to review compliance at ZAC level.",
    };
  }

  const parsed = ZacReviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }

  const db = prismaForTenant(tenantId);

  try {
    const result = await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: "compliance.zac_reviewed",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // Verify compliance item exists and has branch response
      const item = await tx.complianceItem.findFirst({
        where: { id: parsed.data.complianceItemId, tenantId },
      });

      if (!item) {
        throw new Error("Compliance item not found");
      }

      if (item.status !== "BRANCH_RESPONSE_SUBMITTED") {
        throw new Error("Can only review items with submitted branch response");
      }

      // Determine new status based on decision
      let newStatus: string;
      switch (parsed.data.decision) {
        case "APPROVED":
          newStatus = "ZAC_APPROVED";
          break;
        case "REJECTED":
          newStatus = "ZAC_REJECTED";
          break;
        case "REQUEST_INFO":
          newStatus = "BRANCH_RESPONSE_DUE"; // Send back to branch
          break;
      }

      // Update compliance item
      return tx.complianceItem.update({
        where: { id: item.id },
        data: {
          status: newStatus as any,
          zacReviewedById: session.user.id,
          zacReviewedAt: new Date(),
          zacReviewComments: parsed.data.comments,
          zacReviewDecision: parsed.data.decision,
        },
      });
    });

    revalidatePath("/compliance");
    revalidatePath(`/compliance/${result.id}`);

    return {
      success: true as const,
      data: {
        id: result.id,
        status: result.status,
        decision: parsed.data.decision,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to review compliance.";
    logger.error({ error, action: "zac_review_compliance", tenantId }, message);
    return { success: false as const, error: message };
  }
}
