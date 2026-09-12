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
} from "@/data-access/loan-account";
import { GetPortfolioSummarySchema } from "./schemas";

// ─── getPortfolioSummary ──────────────────────────────────────────────────────

/**
 * Get aggregated portfolio summary for an engagement + module.
 *
 * Returns:
 * - Total account count
 * - Per-asset-class breakdown (count + amounts)
 * - Total sanction amount across all accounts
 * - Total outstanding amount across all accounts
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
    const [summary, totalAccounts] = await Promise.all([
      getLoanAccountSummary(session, engagementId, moduleCode),
      countLoanAccountsForModule(session, engagementId, moduleCode),
    ]);

    // Aggregate totals across all asset classes
    let totalSanction = 0;
    let totalOutstanding = 0;

    const byAssetClass = summary.map((row) => {
      const sanctionSum = Number(row._sum.sanctionAmount ?? 0);
      const outstandingSum = Number(row._sum.outstandingAmount ?? 0);
      totalSanction += sanctionSum;
      totalOutstanding += outstandingSum;
      return {
        assetClass: row.assetClass,
        count: row._count,
        sanctionAmount: sanctionSum,
        outstandingAmount: outstandingSum,
      };
    });

    return {
      success: true as const,
      data: {
        totalAccounts,
        byAssetClass,
        totalSanction,
        totalOutstanding,
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
