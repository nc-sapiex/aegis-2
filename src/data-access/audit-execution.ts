import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

/**
 * Get all engagements for the current tenant.
 */
export async function getEngagements(session: Session) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.auditEngagement.findMany({
    where: { tenantId },
    include: {
      branch: { select: { id: true, name: true, code: true, city: true } },
      auditPlan: { select: { id: true, year: true, quarter: true } },
      auditArea: { select: { id: true, name: true } },
      teamMembers: {
        include: {
          user: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get engagement summary counts by status for the current tenant.
 */
export async function getEngagementSummary(session: Session) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const engagements = await db.auditEngagement.groupBy({
    by: ["status"],
    where: { tenantId },
    _count: { id: true },
  });

  const summary = {
    PLANNED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };

  for (const row of engagements) {
    if (row.status in summary) {
      summary[row.status as keyof typeof summary] = row._count.id;
    }
  }

  return {
    ...summary,
    total:
      summary.PLANNED +
      summary.IN_PROGRESS +
      summary.COMPLETED +
      summary.CANCELLED,
  };
}

/**
 * Get engagement with team members, branch, and meetings.
 * Note: auditType (String?) used by engagement gateway fork (Phase 19 ENGG-07)
 */
export async function getEngagementWithTeam(
  session: Session,
  engagementId: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.auditEngagement.findFirst({
    where: { id: engagementId, tenantId },
    include: {
      branch: { select: { id: true, code: true, name: true, city: true } },
      auditPlan: { select: { id: true, year: true, quarter: true } },
      meetings: { select: { meetingType: true, signedOff: true } },
      branchRbiaScore: { select: { frozenAt: true } },
      teamMembers: {
        include: {
          user: { select: { id: true, name: true, email: true, roles: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
