import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

/**
 * Get the cash check record for an engagement.
 * CashCheck has @@unique([engagementId]) so there's at most one per engagement.
 */
export async function getCashCheckForEngagement(
  session: Session,
  engagementId: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.cashCheck.findFirst({
    where: { engagementId, tenantId },
  });
}

/**
 * Get engagement details needed for cash verification context.
 * Returns branch name, engagement status, etc.
 */
export async function getEngagementForCashVerification(
  session: Session,
  engagementId: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.auditEngagement.findFirst({
    where: { id: engagementId, tenantId },
    select: {
      id: true,
      status: true,
      branch: { select: { id: true, code: true, name: true } },
      auditPlan: { select: { year: true, quarter: true } },
    },
  });
}
