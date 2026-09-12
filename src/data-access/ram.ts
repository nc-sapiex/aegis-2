import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

/**
 * Get all active RAM parameter configs for the tenant.
 */
export async function getRamParameterConfigs(session: Session) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.ramParameterConfig.findMany({
    where: { tenantId, isActive: true },
    orderBy: { displayOrder: "asc" },
  });
}

/**
 * Get RAM assessments for a tenant with optional branch filter.
 */
export async function getRamAssessments(
  session: Session,
  options?: { branchId?: string; assessmentYear?: string },
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.ramAssessment.findMany({
    where: {
      tenantId,
      ...(options?.branchId && { branchId: options.branchId }),
      ...(options?.assessmentYear && {
        assessmentYear: options.assessmentYear,
      }),
    },
    include: {
      branch: { select: { id: true, code: true, name: true, city: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get a single RAM assessment with all scores and parameter configs.
 */
export async function getRamAssessmentWithScores(
  session: Session,
  assessmentId: string,
) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.ramAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    include: {
      branch: { select: { id: true, code: true, name: true, city: true } },
      scores: {
        include: {
          paramConfig: {
            select: {
              id: true,
              code: true,
              name: true,
              category: true,
              weight: true,
              maxScore: true,
              scoringCriteria: true,
              displayOrder: true,
            },
          },
        },
        orderBy: { paramConfig: { displayOrder: "asc" } },
      },
    },
  });
}

/**
 * Get a single RAM assessment by ID (without scores).
 */
export async function getRamAssessment(session: Session, assessmentId: string) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  return db.ramAssessment.findFirst({
    where: { id: assessmentId, tenantId },
    include: {
      branch: { select: { id: true, code: true, name: true } },
    },
  });
}
