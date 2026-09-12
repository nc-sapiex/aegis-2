"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import { setAuditContext } from "@/data-access/audit-context";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { ImportLoanCsvSchema, type ImportLoanCsvInput } from "./schemas";

/**
 * Import loan reviews from CSV.
 * Replaces all existing loan reviews for the engagement.
 * Security: Requires examination:respond permission.
 * Atomicity: Delete + bulk create in single transaction.
 */
export async function importLoanReviewCsv(input: ImportLoanCsvInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "examination:respond")) {
    return {
      success: false as const,
      error: "You do not have permission to import loan reviews.",
    };
  }

  const parsed = ImportLoanCsvSchema.safeParse(input);
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
        actionType: "loan_review.csv_imported",
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

      // Delete existing loan reviews for this engagement (replace mode)
      await tx.loanReview.deleteMany({
        where: {
          engagementId: validated.engagementId,
          tenantId,
        },
      });

      // Create all rows in bulk
      await tx.loanReview.createMany({
        data: validated.rows.map((row: any) => ({
          tenantId,
          engagementId: validated.engagementId,
          accountNo: row.accountNo,
          borrowerName: row.borrowerName,
          productType: row.productType,
          sanctionAmount: row.sanctionAmount,
          outstandingAmount: row.outstandingAmount,
          assetClass: row.assetClass,
          dpd: row.dpd,
          auditObservation: row.auditObservation ?? null,
        })),
      });

      return { imported: validated.rows.length };
    });

    revalidatePath("/audit-execution");
    return { success: true as const, data: result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import loan reviews.";
    logger.error({ error, action: "import_loan_csv", tenantId }, message);
    return { success: false as const, error: message };
  }
}
