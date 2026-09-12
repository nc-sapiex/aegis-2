import "server-only";

import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

// ─── getLoanAccountsForEngagement ─────────────────────────────────────────────

/**
 * Get all loan accounts for an engagement with optional moduleCode filter and pagination.
 * Ordered by accountNo ascending.
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Optional module code filter (e.g., "CRD-HLN")
 * @param options - Optional pagination (skip/take)
 */
export async function getLoanAccountsForEngagement(
  session: Session,
  engagementId: string,
  moduleCode?: string,
  options?: { skip?: number; take?: number },
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const where: Record<string, unknown> = {
    engagementId,
    tenantId,
  };

  if (moduleCode) {
    where.moduleCode = moduleCode;
  }

  return db.loanAccount.findMany({
    where,
    orderBy: { accountNo: "asc" },
    skip: options?.skip,
    take: options?.take,
  });
}

// ─── getLoanAccountSummary ────────────────────────────────────────────────────

/**
 * Get loan account summary grouped by asset class for an engagement.
 * Returns count, sum of sanctionAmount, and sum of outstandingAmount per asset class.
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Optional module code filter
 */
export async function getLoanAccountSummary(
  session: Session,
  engagementId: string,
  moduleCode?: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const where: Record<string, unknown> = {
    engagementId,
    tenantId,
  };

  if (moduleCode) {
    where.moduleCode = moduleCode;
  }

  return db.loanAccount.groupBy({
    by: ["assetClass"],
    where,
    _count: true,
    _sum: {
      sanctionAmount: true,
      outstandingAmount: true,
    },
  });
}

// ─── countLoanAccountsForModule ───────────────────────────────────────────────

/**
 * Count the number of loan accounts for the given engagement + moduleCode.
 * Used for "replace X existing accounts" confirmation dialog.
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Module code (e.g., "CRD-HLN")
 */
export async function countLoanAccountsForModule(
  session: Session,
  engagementId: string,
  moduleCode: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.loanAccount.count({
    where: { engagementId, tenantId, moduleCode },
  });
}

// ─── countLoanAccountsWithResponses ──────────────────────────────────────────

/**
 * Count loan accounts that have at least one related AccountExamResponse.
 * Used to block portfolio replacement when examination responses exist.
 *
 * Returns the count of accounts that have responses — if > 0, replacement is blocked.
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Module code filter
 */
export async function countLoanAccountsWithResponses(
  session: Session,
  engagementId: string,
  moduleCode: string,
): Promise<number> {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  // Find accounts that have at least one AccountExamResponse
  const accountsWithResponses = await db.loanAccount.findMany({
    where: {
      engagementId,
      tenantId,
      moduleCode,
      accountExamResponses: {
        some: {},
      },
    },
    select: { id: true },
  });

  return accountsWithResponses.length;
}
