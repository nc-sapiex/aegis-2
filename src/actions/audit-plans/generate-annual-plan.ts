"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { getBranchesForAnnualPlan } from "@/data-access/audit-plans";
import type { BranchAuditSchedule } from "@/data-access/audit-plans";
import { GenerateAnnualPlanSchema } from "./schemas";
import type { GenerateAnnualPlanInput } from "./schemas";

/**
 * Generate annual audit plan based on RAM scores and audit frequency.
 *
 * Two modes:
 * 1. Preview (autoCreateEngagements=false): Returns computed schedules without DB writes
 * 2. Commit (autoCreateEngagements=true): Creates AuditPlan + AuditEngagement records
 *
 * Security: Requires audit_plan:create permission, uses session.tenantId for isolation.
 * Atomicity: Creates AuditPlan and all AuditEngagement records in a single transaction.
 *
 * @param input - Fiscal year and mode flag
 * @returns { success: true, data: { preview?, planId?, engagementsCount? } } | { success: false, error: string }
 */
export async function generateAnnualPlan(input: GenerateAnnualPlanInput) {
  // ─── Step 1: Authentication ────────────────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // ─── Step 2: Permission Check ──────────────────────────────────
  if (!hasPermission(userRoles, "audit_plan:create")) {
    return {
      success: false as const,
      error: "You do not have permission to create audit plans.",
    };
  }

  // ─── Step 3: Input Validation ──────────────────────────────────
  const parsed = GenerateAnnualPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }
  const validated = parsed.data;

  // Parse fiscal year label to year number (e.g., "2025-26" → 2025)
  const fyYear = parseInt(validated.fiscalYear.split("-")[0], 10);

  // ─── Step 4: Tenant-Scoped Database ────────────────────────────
  const db = prismaForTenant(tenantId);

  // ─── Step 5: Fetch Branch Schedules ────────────────────────────
  try {
    const schedules = await getBranchesForAnnualPlan(
      session,
      validated.fiscalYear,
    );

    if (schedules.length === 0) {
      return {
        success: false as const,
        error: "No branches found to schedule for audit plan.",
      };
    }

    // ─── Preview Mode: Return schedules without DB writes ──────────
    if (!validated.autoCreateEngagements) {
      return {
        success: true as const,
        data: { preview: schedules },
      };
    }

    // ─── Commit Mode: Create AuditPlan + Engagements ───────────────
    const result = await db.$transaction(async (tx: any) => {
      // Set audit context for AuditLog trigger
      await setAuditContext(tx, {
        actionType: "audit_plan.generated",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // Check if plan already exists for this year/quarter
      const existingPlan = await tx.auditPlan.findFirst({
        where: {
          tenantId,
          year: fyYear,
          quarter: "Q1_APR_JUN", // Default to Q1 for annual plan
        },
      });

      let auditPlanId: string;

      if (existingPlan) {
        // Update existing plan
        auditPlanId = existingPlan.id;
        await tx.auditPlan.update({
          where: { id: existingPlan.id },
          data: {
            status: "PLANNED",
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new AuditPlan record
        const auditPlan = await tx.auditPlan.create({
          data: {
            tenantId,
            year: fyYear,
            quarter: "Q1_APR_JUN", // Default quarter for annual plan
            status: "PLANNED",
          },
        });
        auditPlanId = auditPlan.id;
      }

      // Create AuditEngagement records for each branch
      const engagements = await Promise.all(
        schedules.map((schedule: BranchAuditSchedule) =>
          tx.auditEngagement.create({
            data: {
              tenantId,
              auditPlanId,
              branchId: schedule.branchId,
              scheduledStartDate: schedule.nextAuditDate,
              status: "PLANNED",
              auditType: "RBIA",
            },
          }),
        ),
      );

      return {
        planId: auditPlanId,
        engagementsCount: engagements.length,
      };
    });

    // ─── Step 6: Cache Revalidation ────────────────────────────
    revalidatePath("/audit-plans");

    // ─── Step 7: Success Response ──────────────────────────────
    return {
      success: true as const,
      data: {
        planId: result.planId,
        engagementsCount: result.engagementsCount,
      },
    };
  } catch (error) {
    // ─── Step 8: Error Handling ────────────────────────────────
    logger.error(
      {
        error,
        action: "generate_annual_plan",
        tenantId,
        fiscalYear: validated.fiscalYear,
      },
      "Failed to generate annual audit plan",
    );

    return {
      success: false as const,
      error: "Failed to generate annual audit plan. Please try again.",
    };
  }
}
