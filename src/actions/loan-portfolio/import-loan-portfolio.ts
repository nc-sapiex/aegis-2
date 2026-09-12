"use server";

/**
 * Server action: importLoanPortfolio
 *
 * Atomically replaces the loan portfolio for a given engagement + moduleCode.
 * Replacement is blocked if any accounts have examination responses.
 *
 * Security: requires rbia:examine permission (HIA role)
 * Atomicity: delete + createMany in a single Prisma transaction
 * Audit: sets audit context before mutations for trigger logging
 */

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import type { Prisma } from "@/generated/prisma/client";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { countLoanAccountsWithResponses } from "@/data-access/loan-account";
import {
  ImportLoanPortfolioSchema,
  type ImportLoanPortfolioInput,
} from "./schemas";

// ─── importLoanPortfolio ──────────────────────────────────────────────────────

/**
 * Import a validated loan portfolio for an engagement + module.
 *
 * Steps:
 * 1. Auth + permission check
 * 2. Zod validation
 * 3. Engagement existence check
 * 4. Block if exam responses exist
 * 5. Atomic transaction: count old → delete old → createMany new
 * 6. Revalidate cache
 *
 * @param input - Validated rows from the UI (after column-mapper.ts processing)
 */
export async function importLoanPortfolio(input: ImportLoanPortfolioInput) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "rbia:examine")) {
    return {
      success: false as const,
      error: "You do not have permission to import loan portfolios.",
    };
  }

  // ── Validation ──────────────────────────────────────────────────────────
  const parsed = ImportLoanPortfolioSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input data",
    };
  }
  const validated = parsed.data;

  try {
    // ── Check for exam responses (block replacement) ──────────────────────
    const accountsWithResponses = await countLoanAccountsWithResponses(
      session,
      validated.engagementId,
      validated.moduleCode,
    );

    if (accountsWithResponses > 0) {
      return {
        success: false as const,
        error: `Cannot replace portfolio — ${accountsWithResponses} account${accountsWithResponses === 1 ? "" : "s"} ${accountsWithResponses === 1 ? "has" : "have"} examination responses. Clear responses first or create a new engagement.`,
      };
    }

    // ── Atomic transaction ────────────────────────────────────────────────
    const result = await withAuditedMutation(
      userActor(session),
      "loan_account.portfolio_imported",
      async (tx) => {
        // Verify engagement exists and belongs to tenant
        const engagement = await tx.auditEngagement.findFirst({
          where: { id: validated.engagementId, tenantId },
          select: { id: true, branchId: true },
        });

        if (!engagement) {
          throw new Error(
            "Engagement not found or does not belong to your organization",
          );
        }

        const branchId = engagement.branchId as string;

        // Count existing accounts (for the "replaced X" summary)
        const previousCount = await tx.loanAccount.count({
          where: {
            engagementId: validated.engagementId,
            tenantId,
            moduleCode: validated.moduleCode,
          },
        });

        // Delete existing accounts for this engagement + module
        await tx.loanAccount.deleteMany({
          where: {
            engagementId: validated.engagementId,
            tenantId,
            moduleCode: validated.moduleCode,
          },
        });

        // Import timestamp — used as fallback for missing sanctionDate
        const importTimestamp = new Date();

        // Bulk create new accounts
        await tx.loanAccount.createMany({
          data: validated.rows.map((row) => ({
            tenantId,
            engagementId: validated.engagementId,
            branchId,
            moduleCode: validated.moduleCode,
            accountNo: row.accountNo,
            borrowerName: row.borrowerName,
            productType: row.loanType, // loanType in ParsedLoanRow → productType in DB
            sanctionAmount: row.sanctionAmount,
            outstandingAmount: row.outstandingAmount,
            assetClass: row.assetClass,
            dpd: row.dpd,
            // sanctionDate is required in DB — use provided date or fallback to import timestamp
            sanctionDate: row.sanctionDate
              ? new Date(row.sanctionDate)
              : importTimestamp,
            metadata: row.metadata as Prisma.InputJsonValue,
          })),
        });

        return { imported: validated.rows.length, replaced: previousCount };
      },
    );

    // ── Revalidate ────────────────────────────────────────────────────────
    revalidatePath(`/audit-execution/${validated.engagementId}`);
    revalidatePath(`/audit-execution/${validated.engagementId}/rbia`);

    logger.info(
      {
        action: "import_loan_portfolio",
        tenantId,
        engagementId: validated.engagementId,
        moduleCode: validated.moduleCode,
        imported: result.imported,
        replaced: result.replaced,
      },
      "Loan portfolio imported successfully",
    );

    return {
      success: true as const,
      data: {
        imported: result.imported,
        replaced: result.replaced,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to import loan portfolio. Please try again.";
    logger.error(
      {
        error,
        action: "import_loan_portfolio",
        tenantId,
        engagementId: validated.engagementId,
        moduleCode: validated.moduleCode,
      },
      message,
    );
    return { success: false as const, error: message };
  }
}
