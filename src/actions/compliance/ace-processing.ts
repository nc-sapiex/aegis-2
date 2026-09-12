"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { getAceEligibleItems } from "@/data-access/compliance-items";
import {
  ProcessAceQuarterlySchema,
  ReviewAceItemSchema,
  type ProcessAceQuarterlyInput,
  type ReviewAceItemInput,
} from "./schemas";

/**
 * Process ACE quarterly batch (R37).
 * Tags all L3+ items with the quarter for ACE review cycle.
 * Security: Requires ACE_OFFICER or CAE role.
 * Atomicity: Updates all eligible items in transaction.
 */
export async function processAceQuarterly(input: ProcessAceQuarterlyInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // Permission check
  if (!hasPermission(userRoles, "compliance:ace_process")) {
    return {
      success: false as const,
      error: "You do not have permission to process ACE quarterly review.",
    };
  }

  // Validate input
  const parsed = ProcessAceQuarterlySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }

  const validated = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    // Fetch eligible items (L3+)
    const eligibleItems = await getAceEligibleItems(session);

    if (eligibleItems.length === 0) {
      return {
        success: true as const,
        data: { processed: 0, quarter: validated.quarter },
      };
    }

    // Batch tag items with quarter
    const result = await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: "ace.quarterly_processed",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      let processed = 0;

      for (const item of eligibleItems) {
        // Only tag items that haven't been assigned to a quarter yet
        if (!item.aceQuarter) {
          await tx.complianceItem.update({
            where: { id: item.id },
            data: {
              aceQuarter: validated.quarter,
              status: "ACE_REVIEW",
            },
          });
          processed++;
        }
      }

      return processed;
    });

    revalidatePath("/compliance");
    revalidatePath("/compliance/ace");

    return {
      success: true as const,
      data: { processed: result, quarter: validated.quarter },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process ACE quarterly review.";
    logger.error({ error, action: "process_ace_quarterly", tenantId }, message);
    return { success: false as const, error: message };
  }
}

/**
 * Review individual ACE compliance item (R37).
 * ACE officer can: forward to ACB, continue monitoring, or close.
 * Security: Requires ACE_OFFICER or CAE role.
 * Atomicity: Updates ComplianceItem with decision in transaction.
 */
export async function reviewAceItem(input: ReviewAceItemInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // Permission check
  if (!hasPermission(userRoles, "compliance:ace_process")) {
    return {
      success: false as const,
      error: "You do not have permission to review ACE items.",
    };
  }

  // Validate input
  const parsed = ReviewAceItemSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }

  const validated = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    const result = await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: "ace.item_reviewed",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // Fetch and verify compliance item
      const item = await tx.complianceItem.findFirst({
        where: { id: validated.complianceItemId, tenantId },
      });

      if (!item) {
        throw new Error("Compliance item not found");
      }

      if (item.status !== "ACE_REVIEW") {
        throw new Error("Can only review items in ACE_REVIEW status");
      }

      // Determine new status based on decision
      let newStatus: string;
      let closedAt: Date | null = null;
      let closedById: string | null = null;

      switch (validated.decision) {
        case "FORWARD_TO_ACB":
          newStatus = "ACB_REVIEW";
          break;
        case "MONITOR":
          newStatus = "ACE_REVIEW"; // Keep in ACE queue
          break;
        case "CLOSE":
          newStatus = "CLOSED";
          closedAt = new Date();
          closedById = session.user.id;
          break;
      }

      // Update compliance item with ACE review metadata
      return tx.complianceItem.update({
        where: { id: item.id },
        data: {
          status: newStatus as any,
          aceReviewedById: session.user.id,
          aceReviewedAt: new Date(),
          aceQuarter: validated.quarter,
          ...(closedAt && { closedAt }),
          ...(closedById && { closedById }),
        },
      });
    });

    revalidatePath("/compliance");
    revalidatePath("/compliance/ace");
    revalidatePath(`/compliance/${result.id}`);

    return {
      success: true as const,
      data: {
        id: result.id,
        status: result.status,
        decision: validated.decision,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to review ACE item.";
    logger.error({ error, action: "review_ace_item", tenantId }, message);
    return { success: false as const, error: message };
  }
}
