"use server";

/**
 * Server action: getPortfolioSummary
 *
 * Returns aggregated statistics for the loan portfolio of an engagement + module.
 * Used by the UI to show "X accounts uploaded, Y total outstanding" etc.
 *
 * Security: requires rbia:examine permission
 */

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  getLoanAccountSummary,
  countLoanAccountsForModule,
  getSanctionAmountTotal,
} from "@/data-access/loan-account";
import { GetPortfolioSummarySchema } from "./schemas";

// ─── getPortfolioSummary ──────────────────────────────────────────────────────

/**
 * Get aggregated portfolio summary for an engagement + module.
 *
 * Returns:
 * - Total account count
 * - Per-classification breakdown (count + amount)
 * - Total amount across all accounts
 * - Total sanction amount (read out of metadata; see getSanctionAmountTotal)
 *
 * @param input - engagementId + moduleCode
 */
export async function getPortfolioSummary(input: {
  engagementId: string;
  moduleCode: string;
}) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "rbia:examine")) {
    return {
      success: false as const,
      error: "You do not have permission to view portfolio summary.",
    };
  }

  // ── Validation ──────────────────────────────────────────────────────────
  const parsed = GetPortfolioSummarySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { engagementId, moduleCode } = parsed.data;

  try {
    // ── Queries ─────────────────────────────────────────────────────────
    const [summary, totalAccounts, totalSanction] = await Promise.all([
      getLoanAccountSummary(session, engagementId, moduleCode),
      countLoanAccountsForModule(session, engagementId, moduleCode),
      getSanctionAmountTotal(session, engagementId, moduleCode),
    ]);

    // Aggregate totals across all classifications
    let totalOutstanding = 0;

    const byAssetClass = summary.map((row) => {
      const outstandingSum = Number(row._sum.amount ?? 0);
      totalOutstanding += outstandingSum;
      return {
        assetClass: row.classification,
        count: row._count,
        outstandingAmount: outstandingSum,
      };
    });

    return {
      success: true as const,
      data: {
        totalAccounts,
        byAssetClass,
        totalOutstanding,
        totalSanction,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch portfolio summary.";
    logger.error(
      { error, action: "get_portfolio_summary", engagementId, moduleCode },
      message,
    );
    return { success: false as const, error: message };
  }
}
