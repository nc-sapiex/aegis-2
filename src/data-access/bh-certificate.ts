import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

export type BhCertificateStatus = "PENDING" | "SIGNED" | "COUNTERSIGNED";

/**
 * Derive BH certificate status from engagement fields.
 * Since we don't have a dedicated status field, derive from data:
 * - bhCertSignedAt is null → PENDING
 * - bhCertSignedAt set, no countersign → SIGNED
 * - Both set → COUNTERSIGNED
 */
export function deriveBhCertStatus(engagement: {
  bhCertSignedAt: Date | null;
  bhCertCountersignedAt?: Date | null;
}): BhCertificateStatus {
  if (engagement.bhCertCountersignedAt) return "COUNTERSIGNED";
  if (engagement.bhCertSignedAt) return "SIGNED";
  return "PENDING";
}

/**
 * Get engagement with BH certificate fields + audit context.
 */
export async function getEngagementForBhCertificate(
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
      auditNumber: true,
      bhCertSignedById: true,
      bhCertSignedAt: true,
      bhCertComments: true,
      bhCertCountersignedById: true,
      bhCertCountersignedAt: true,
      branch: { select: { id: true, code: true, name: true } },
      auditPlan: { select: { year: true, quarter: true } },
      teamMembers: {
        include: {
          user: { select: { id: true, name: true, email: true, roles: true } },
        },
      },
      // Include observation summary for certificate content
      observations: {
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
        },
      },
    },
  });
}
