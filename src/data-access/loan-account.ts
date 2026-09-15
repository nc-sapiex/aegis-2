import "server-only";

import { prismaForTenant } from "./prisma";
import { getModuleIdByCode } from "./audit-modules";
import type { AuthSession as Session } from "@/lib/auth";

// ─── getLoanAccountsForEngagement ─────────────────────────────────────────────

/**
 * Get all population records for an engagement with optional moduleCode filter and pagination.
 * Ordered by recordKey ascending.
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
    const moduleId = await getModuleIdByCode(db, tenantId, moduleCode);
    if (!moduleId) return [];
    where.moduleId = moduleId;
  }

  return db.populationRecord.findMany({
    where: { tenantId, ...where },
    orderBy: { recordKey: "asc" },
    skip: options?.skip,
    take: options?.take,
  });
}

// ─── getLoanAccountSummary ────────────────────────────────────────────────────

/**
 * Get population record summary grouped by classification for an engagement.
 * Returns count and sum of amount per classification.
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
    const moduleId = await getModuleIdByCode(db, tenantId, moduleCode);
    if (!moduleId) return [];
    where.moduleId = moduleId;
  }

  return db.populationRecord.groupBy({
    by: ["classification"],
    where: { tenantId, ...where },
    _count: true,
    _sum: {
      amount: true,
    },
  });
}

// ─── getSanctionAmountTotal ───────────────────────────────────────────────────

/**
 * Sum sanctionAmount out of PopulationRecord.metadata for an engagement +
 * module. sanctionAmount has no canonical column (it's credit-loan-specific,
 * not every module's population has one) — this is the one place that still
 * needs it, for the loan-portfolio "Total Sanction" card, so it reads
 * straight out of the JSONB metadata via a tenant-scoped raw aggregate.
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Module code (e.g., "CRD-HLN")
 */
export async function getSanctionAmountTotal(
  session: Session,
  engagementId: string,
  moduleCode: string,
): Promise<number> {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);
  const moduleId = await getModuleIdByCode(db, tenantId, moduleCode);
  if (!moduleId) return 0;

  const rows = await db.$queryRaw<{ total: string | null }[]>`
    SELECT SUM(("metadata"->>'sanctionAmount')::numeric) as total
    FROM "PopulationRecord"
    WHERE "tenantId" = ${tenantId}
      AND "engagementId" = ${engagementId}
      AND "moduleId" = ${moduleId}
  `;
  return Number(rows[0]?.total ?? 0);
}

// ─── countLoanAccountsForModule ───────────────────────────────────────────────

/**
 * Count the number of population records for the given engagement + moduleCode.
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
  const moduleId = await getModuleIdByCode(db, tenantId, moduleCode);
  if (!moduleId) return 0;

  return db.populationRecord.count({
    where: { engagementId, tenantId, moduleId },
  });
}

// ─── countLoanAccountsWithResponses ──────────────────────────────────────────

/**
 * Count population records that have at least one related AccountExamResponse.
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
  const moduleId = await getModuleIdByCode(db, tenantId, moduleCode);
  if (!moduleId) return 0;

  // Find records that have at least one AccountExamResponse
  const accountsWithResponses = await db.populationRecord.findMany({
    where: {
      engagementId,
      tenantId,
      moduleId,
      accountExamResponses: {
        some: {},
      },
    },
    select: { id: true },
  });

  return accountsWithResponses.length;
}
