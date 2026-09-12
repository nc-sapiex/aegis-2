"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  SaveCashVerificationSchema,
  type SaveCashVerificationInput,
} from "./schemas";

/**
 * Save or update cash verification data for an engagement.
 * Uses upsert pattern since there's exactly one CashCheck per engagement (@@unique).
 * Auto-computes difference = cashInHand - bookBalance.
 * Returns retentionExceeded flag if cash exceeds retention limit.
 *
 * Security: Requires examination:respond permission.
 * Atomicity: Single upsert transaction with audit context.
 */
export async function saveCashVerification(input: SaveCashVerificationInput) {
  // ─── Step 1: Authentication ────────────────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // ─── Step 2: Permission Check ──────────────────────────────────
  if (!hasPermission(userRoles, "examination:respond")) {
    return {
      success: false as const,
      error: "You do not have permission to save cash verification data.",
    };
  }

  // ─── Step 3: Input Validation ──────────────────────────────────
  const parsed = SaveCashVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }
  const validated = parsed.data;

  // ─── Step 4: Tenant-Scoped Database ────────────────────────────
  const db = prismaForTenant(tenantId);

  // ─── Step 5: Transaction (Atomic Operation) ────────────────────
  try {
    const result = await db.$transaction(async (tx: any) => {
      // Set audit context for AuditLog trigger
      await setAuditContext(tx, {
        actionType: "cash_check.saved",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // Verify engagement exists and belongs to tenant
      const engagement = await tx.auditEngagement.findFirst({
        where: { id: validated.engagementId, tenantId },
        select: { id: true },
      });

      if (!engagement) {
        throw new Error("Engagement not found");
      }

      // Compute difference
      const difference = validated.cashInHand - validated.bookBalance;

      // Upsert CashCheck (unique on engagementId)
      const cashCheck = await tx.cashCheck.upsert({
        where: {
          engagementId: validated.engagementId,
        },
        update: {
          cashInHand: validated.cashInHand,
          bookBalance: validated.bookBalance,
          difference,
          retentionLimit: validated.retentionLimit ?? null,
          denominationData: validated.denominationData ?? null,
          atmBalances: validated.atmBalances ?? null,
          remarks: validated.remarks ?? null,
          verifiedById: session.user.id,
          verifiedAt: new Date(),
        },
        create: {
          tenantId,
          engagementId: validated.engagementId,
          cashInHand: validated.cashInHand,
          bookBalance: validated.bookBalance,
          difference,
          retentionLimit: validated.retentionLimit ?? null,
          denominationData: validated.denominationData ?? null,
          atmBalances: validated.atmBalances ?? null,
          remarks: validated.remarks ?? null,
          verifiedById: session.user.id,
          verifiedAt: new Date(),
        },
      });

      return cashCheck;
    });

    // ─── Step 6: Cache Revalidation ────────────────────────────
    revalidatePath(
      `/audit-execution/${validated.engagementId}/cash-verification`,
    );
    revalidatePath(`/audit-execution/${validated.engagementId}`);

    // ─── Step 7: Success Response ──────────────────────────────
    // Check if cash exceeds retention limit
    const retentionExceeded = validated.retentionLimit
      ? validated.cashInHand > validated.retentionLimit
      : false;

    return {
      success: true as const,
      data: {
        id: result.id,
        retentionExceeded,
      },
    };
  } catch (error) {
    // ─── Step 8: Error Handling ────────────────────────────────
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save cash verification data.";
    logger.error(
      { error, action: "save_cash_verification", tenantId },
      message,
    );

    return {
      success: false as const,
      error: message,
    };
  }
}

/**
 * Get cash verification data for an engagement.
 * This is a convenience action for client components that need to fetch data.
 */
export async function getCashVerificationAction(engagementId: string) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "examination:respond")) {
    return {
      success: false as const,
      error: "You do not have permission to view cash verification data.",
    };
  }

  const db = prismaForTenant(tenantId);

  try {
    const cashCheck = await db.cashCheck.findFirst({
      where: { engagementId, tenantId },
    });

    return {
      success: true as const,
      data: cashCheck,
    };
  } catch (error) {
    logger.error(
      { error, action: "get_cash_verification", tenantId },
      "Failed to fetch cash verification data",
    );

    return {
      success: false as const,
      error: "Failed to fetch cash verification data.",
    };
  }
}
