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
 * Get engagement with team members, branch, and section instances.
 * Note: auditType (String?) used by engagement gateway fork (Phase 19 ENGG-07)
 * sectionInstances used to distinguish legacy vs RBIA engagements
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
      teamMembers: {
        include: {
          user: { select: { id: true, name: true, email: true, roles: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      sectionInstances: {
        orderBy: { sectionCode: "asc" },
      },
    },
  });
}

/**
 * Get section instances for an engagement.
 */
export async function getEngagementSections(
  session: Session,
  engagementId: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.auditSectionInstance.findMany({
    where: { engagementId, tenantId },
    orderBy: { sectionCode: "asc" },
  });
}

/**
 * Get examination responses for a specific section/area within an engagement.
 * Returns all items for the area with their response status.
 */
export async function getExaminationResponsesForSection(
  session: Session,
  engagementId: string,
  areaCode: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  // Get the examination area
  const area = await db.examinationArea.findFirst({
    where: { tenantId, code: areaCode, isActive: true },
    select: { id: true, code: true, name: true },
  });

  if (!area) return null;

  // Get all items for this area with their responses for this engagement
  const items = await db.examinationItem.findMany({
    where: { tenantId, areaId: area.id, isActive: true },
    include: {
      responses: {
        where: { engagementId },
        select: {
          id: true,
          status: true,
          observation: true,
          riskRating: true,
          respondedById: true,
          respondedAt: true,
          observationId: true,
          evidence: {
            where: { deletedAt: null },
            select: {
              id: true,
              filename: true,
              s3Key: true,
              fileSize: true,
              contentType: true,
              description: true,
              createdAt: true,
              uploadedBy: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  return { area, items };
}

/**
 * Get examination items for a section (used during initialization to count items).
 */
export async function getEngagementExaminationItems(
  session: Session,
  engagementId: string,
  areaCode: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const area = await db.examinationArea.findFirst({
    where: { tenantId, code: areaCode, isActive: true },
  });

  if (!area) return [];

  return db.examinationItem.findMany({
    where: { tenantId, areaId: area.id, isActive: true },
    orderBy: { displayOrder: "asc" },
  });
}

/**
 * Get evidence attached to a specific examination response.
 */
export async function getEvidenceForExaminationResponse(
  session: Session,
  responseId: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.evidence.findMany({
    where: {
      examinationResponseId: responseId,
      tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      filename: true,
      s3Key: true,
      fileSize: true,
      contentType: true,
      description: true,
      createdAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}
