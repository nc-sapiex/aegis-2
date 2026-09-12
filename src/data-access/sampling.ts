import "server-only";

import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";
import type { LoanAccountForSampling } from "@/lib/sampling-engine";

// ─── getSamplingConfig ────────────────────────────────────────────────────────

/**
 * Get the sampling config for a given engagement + module.
 * Returns null if no config has been created yet.
 *
 * Tenant isolation: WHERE tenantId = session.user.tenantId
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Credit module code (e.g., "CRD-HLN")
 */
export async function getSamplingConfig(
  session: Session,
  engagementId: string,
  moduleCode: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.samplingConfig.findFirst({
    where: {
      engagementId,
      moduleCode,
      tenantId,
    },
  });
}

// ─── getSamplingConfigWithCreator ─────────────────────────────────────────────

/**
 * Get the sampling config for a given engagement + module, including
 * the name of the user who locked the config (for attribution text).
 *
 * Tenant isolation: WHERE tenantId = session.user.tenantId
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Credit module code (e.g., "CRD-HLN")
 */
export async function getSamplingConfigWithCreator(
  session: Session,
  engagementId: string,
  moduleCode: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const config = await db.samplingConfig.findFirst({
    where: {
      engagementId,
      moduleCode,
      tenantId,
    },
  });

  if (!config) return null;

  // If a lockedById is set, look up the user's name for attribution
  let lockedByName: string | null = null;
  if (config.lockedById) {
    const lockedByUser = await db.user.findFirst({
      where: { id: config.lockedById, tenantId },
      select: { name: true },
    });
    lockedByName = lockedByUser?.name ?? null;
  }

  return { ...config, lockedByName };
}

// ─── getLoanAccountsForSampling ───────────────────────────────────────────────

/**
 * Get all loan accounts for the given engagement + module in the shape
 * expected by the sampling engine.
 *
 * Converts Prisma Decimal fields to number, and extracts
 * hasPriorObservations from the metadata JSONB.
 *
 * Tenant isolation: WHERE tenantId = session.user.tenantId
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Credit module code (e.g., "CRD-HLN")
 */
export async function getLoanAccountsForSampling(
  session: Session,
  engagementId: string,
  moduleCode: string,
): Promise<LoanAccountForSampling[]> {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const accounts = await db.loanAccount.findMany({
    where: {
      engagementId,
      moduleCode,
      tenantId,
    },
    orderBy: { accountNo: "asc" },
  });

  // Map Prisma model to LoanAccountForSampling (convert Decimal → number)
  return accounts.map((account) => {
    const meta =
      account.metadata && typeof account.metadata === "object"
        ? (account.metadata as Record<string, unknown>)
        : null;

    return {
      id: account.id,
      accountNo: account.accountNo,
      borrowerName: account.borrowerName,
      productType: account.productType,
      sanctionAmount: Number(account.sanctionAmount),
      sanctionDate: account.sanctionDate,
      outstandingAmount: Number(account.outstandingAmount),
      assetClass: account.assetClass,
      dpd: account.dpd,
      metadata: meta,
      isSampled: account.isSampled,
      sampledAt: account.sampledAt,
      hasPriorObservations:
        typeof meta?.hasPriorObservations === "boolean"
          ? meta.hasPriorObservations
          : false,
    };
  });
}

// ─── getSampledAccounts ───────────────────────────────────────────────────────

/**
 * Get all sampled loan accounts for the given engagement + module.
 * Returns full account data + the samplingBucket tag from metadata.
 *
 * Tenant isolation: WHERE tenantId = session.user.tenantId
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Credit module code (e.g., "CRD-HLN")
 */
export async function getSampledAccounts(
  session: Session,
  engagementId: string,
  moduleCode: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const accounts = await db.loanAccount.findMany({
    where: {
      engagementId,
      moduleCode,
      tenantId,
      isSampled: true,
    },
    orderBy: { accountNo: "asc" },
  });

  // Extract samplingBucket from metadata for UI bucket badge
  return accounts.map((account) => {
    const meta =
      account.metadata && typeof account.metadata === "object"
        ? (account.metadata as Record<string, unknown>)
        : null;

    return {
      id: account.id,
      accountNo: account.accountNo,
      borrowerName: account.borrowerName,
      productType: account.productType,
      sanctionAmount: Number(account.sanctionAmount),
      outstandingAmount: Number(account.outstandingAmount),
      assetClass: account.assetClass,
      dpd: account.dpd,
      isSampled: account.isSampled,
      sampledAt: account.sampledAt,
      samplingBucket:
        typeof meta?.samplingBucket === "string" ? meta.samplingBucket : null,
    };
  });
}

// ─── getLoanAccountCount ──────────────────────────────────────────────────────

/**
 * Count total loan accounts for the given engagement + module.
 * Used for "X% of N = M accounts" display in the sampling UI.
 *
 * Tenant isolation: WHERE tenantId = session.user.tenantId
 *
 * @param session - Authenticated session (provides tenantId)
 * @param engagementId - UUID of the AuditEngagement
 * @param moduleCode - Credit module code (e.g., "CRD-HLN")
 */
export async function getLoanAccountCount(
  session: Session,
  engagementId: string,
  moduleCode: string,
): Promise<number> {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.loanAccount.count({
    where: {
      engagementId,
      moduleCode,
      tenantId,
    },
  });
}
