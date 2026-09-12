"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { getAcbEligibleItems } from "@/data-access/compliance-items";
import {
  GenerateAcbReportSchema,
  type GenerateAcbReportInput,
} from "./schemas";

/**
 * Generate ACB quarterly board report (R38).
 * Consolidates escalated compliance items for board review.
 * Security: Requires CAE or ACB_MEMBER role.
 * Atomicity: Creates BoardReport and marks items as ACB-reported in transaction.
 */
export async function generateAcbReport(input: GenerateAcbReportInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  // Permission check
  if (!hasPermission(userRoles, "compliance:acb_report")) {
    return {
      success: false as const,
      error: "You do not have permission to generate ACB reports.",
    };
  }

  // Validate input
  const parsed = GenerateAcbReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }

  const validated = parsed.data;
  const db = prismaForTenant(tenantId);

  try {
    // Fetch ACB-eligible items
    const items = await getAcbEligibleItems(session, {
      quarter: validated.quarter,
    });

    // Aggregate data for board pack
    const consolidated = {
      quarter: validated.quarter,
      totalItems: items.length,
      bySeverity: {
        critical: items.filter((i) => i.observation?.severity === "CRITICAL")
          .length,
        high: items.filter((i) => i.observation?.severity === "HIGH").length,
        medium: items.filter((i) => i.observation?.severity === "MEDIUM")
          .length,
        low: items.filter((i) => i.observation?.severity === "LOW").length,
      },
      byBranch: groupByBranch(items),
      byEscalationLevel: groupByLevel(items),
      agingSummary: computeAgingSummary(items),
    };

    // Create board report and mark items as ACB-reported
    const result = await db.$transaction(async (tx: any) => {
      await setAuditContext(tx, {
        actionType: "acb.report_generated",
        userId: session.user.id,
        tenantId,
        sessionId: session.session.id,
      });

      // Parse quarter string to year and quarter enum
      const [yearStr, quarterStr] = validated.quarter.split("-Q");
      const year = parseInt(yearStr, 10);
      const quarterEnum = mapQuarterToEnum(validated.quarter);

      // Create BoardReport record
      const report = await tx.boardReport.create({
        data: {
          tenantId,
          year,
          quarter: quarterEnum,
          title: validated.title,
          executiveCommentary: validated.executiveCommentary ?? null,
          generatedById: session.user.id,
          metricsSnapshot: consolidated,
        },
      });

      // Mark compliance items as ACB-reported
      for (const item of items) {
        await tx.complianceItem.update({
          where: { id: item.id },
          data: {
            acbReportedAt: new Date(),
            acbMeetingRef: `ACB-${validated.quarter}`,
          },
        });
      }

      return report;
    });

    revalidatePath("/compliance");
    revalidatePath("/compliance/acb");
    revalidatePath("/reports");

    return {
      success: true as const,
      data: {
        reportId: result.id,
        itemCount: items.length,
        consolidated,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate ACB report.";
    logger.error({ error, action: "generate_acb_report", tenantId }, message);
    return { success: false as const, error: message };
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Group items by branch name with counts.
 */
function groupByBranch(items: any[]): Record<string, number> {
  const grouped: Record<string, number> = {};

  for (const item of items) {
    const branchName = item.branch?.name ?? "Unknown";
    grouped[branchName] = (grouped[branchName] ?? 0) + 1;
  }

  return grouped;
}

/**
 * Group items by escalation level.
 */
function groupByLevel(items: any[]): Record<string, number> {
  const grouped: Record<string, number> = {
    L0: 0,
    L1: 0,
    L2: 0,
    L3: 0,
    "L4+": 0,
  };

  for (const item of items) {
    const level = item.escalationLevel ?? 0;
    if (level === 0) grouped["L0"]++;
    else if (level === 1) grouped["L1"]++;
    else if (level === 2) grouped["L2"]++;
    else if (level === 3) grouped["L3"]++;
    else grouped["L4+"]++;
  }

  return grouped;
}

/**
 * Compute aging buckets (days overdue).
 */
function computeAgingSummary(items: any[]): Record<string, number> {
  const buckets = {
    "30-60 days": 0,
    "60-90 days": 0,
    "90-180 days": 0,
    "180+ days": 0,
  };

  for (const item of items) {
    const daysOpen = item.daysOpen ?? 0;

    if (daysOpen >= 30 && daysOpen < 60) buckets["30-60 days"]++;
    else if (daysOpen >= 60 && daysOpen < 90) buckets["60-90 days"]++;
    else if (daysOpen >= 90 && daysOpen < 180) buckets["90-180 days"]++;
    else if (daysOpen >= 180) buckets["180+ days"]++;
  }

  return buckets;
}

/**
 * Map quarter string to Quarter enum.
 * "2025-Q1" → "Q1_APR_JUN"
 */
function mapQuarterToEnum(quarterStr: string): string {
  const quarterNum = quarterStr.split("-Q")[1];

  switch (quarterNum) {
    case "1":
      return "Q1_APR_JUN";
    case "2":
      return "Q2_JUL_SEP";
    case "3":
      return "Q3_OCT_DEC";
    case "4":
      return "Q4_JAN_MAR";
    default:
      throw new Error(`Invalid quarter: ${quarterStr}`);
  }
}
