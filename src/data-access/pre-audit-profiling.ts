import "server-only";

import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

/**
 * R12: Pre-audit branch profiling data
 *
 * Aggregates comprehensive branch context for pre-audit review:
 * - Branch details and metadata
 * - Last audit engagement data
 * - Latest RAM assessment with breakdown (BUSINESS_RISK vs CONTROL_RISK)
 * - Prior findings summary (grouped by severity + top 5)
 * - Compliance status summary (grouped by status)
 *
 * Security: tenantId from session, all queries filtered by tenantId
 *
 * @param session - Authenticated user session
 * @param branchId - Branch UUID to profile
 * @returns Branch profile data with aggregations, or null if branch not found
 */
export async function getBranchProfileData(session: Session, branchId: string) {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  // 1. Fetch branch details
  const branch = await db.branch.findFirst({
    where: { id: branchId, tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      city: true,
      state: true,
      category: true,
      businessSize: true,
      staffStrength: true,
      ramScore: true,
      auditFrequency: true,
      lastAuditDate: true,
      lastAuditRating: true,
    },
  });

  // 2. Fetch last audit engagement
  const lastAudit = await db.auditEngagement.findFirst({
    where: { branchId, tenantId },
    orderBy: { actualEndDate: "desc" },
    select: {
      id: true,
      auditNumber: true,
      auditType: true,
      actualStartDate: true,
      actualEndDate: true,
      overallRiskRating: true,
    },
  });

  // 3. Fetch latest RAM assessment with breakdown
  const ramAssessment = await db.ramAssessment.findFirst({
    where: { branchId, tenantId, status: "APPROVED" },
    orderBy: { approvedAt: "desc" },
    include: {
      scores: {
        include: {
          paramConfig: {
            select: { code: true, name: true, category: true, weight: true },
          },
        },
      },
    },
  });

  // Compute RAM breakdown by category
  let businessRiskScore = 0;
  let controlRiskScore = 0;

  if (ramAssessment?.scores) {
    for (const scoreRecord of ramAssessment.scores) {
      const weightedScore =
        Number(scoreRecord.score) * Number(scoreRecord.paramConfig.weight);

      if (scoreRecord.paramConfig.category === "BUSINESS_RISK") {
        businessRiskScore += weightedScore;
      } else if (scoreRecord.paramConfig.category === "CONTROL_RISK") {
        controlRiskScore += weightedScore;
      }
    }
  }

  const ramBreakdown = {
    compositeScore: ramAssessment?.compositeScore
      ? Number(ramAssessment.compositeScore)
      : 0,
    businessRiskScore: Math.round(businessRiskScore * 100) / 100,
    controlRiskScore: Math.round(controlRiskScore * 100) / 100,
    assessmentYear: ramAssessment?.assessmentYear ?? null,
    riskCategory: ramAssessment?.riskCategory ?? null,
  };

  // 4. Fetch prior findings summary
  const findingsSummary = await db.observation.groupBy({
    by: ["severity"],
    where: {
      branchId,
      tenantId,
      status: { in: ["ISSUED", "RESPONSE", "COMPLIANCE", "CLOSED"] },
    },
    _count: { id: true },
  });

  const topFindings = await db.observation.findMany({
    where: {
      branchId,
      tenantId,
      severity: { in: ["CRITICAL", "HIGH"] },
      status: { in: ["ISSUED", "RESPONSE", "COMPLIANCE", "CLOSED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      createdAt: true,
    },
  });

  // 5. Fetch compliance status summary
  const complianceSummary = await db.complianceItem.groupBy({
    by: ["status"],
    where: { branchId, tenantId },
    _count: { id: true },
  });

  return {
    branch,
    lastAudit,
    ramBreakdown,
    findingsSummary: {
      bySeverity: findingsSummary.map((item) => ({
        severity: item.severity,
        count: item._count.id,
      })),
      topFindings: topFindings.map((finding) => ({
        id: finding.id,
        title: finding.title,
        severity: finding.severity,
        status: finding.status,
        createdAt: finding.createdAt,
      })),
    },
    complianceSummary: complianceSummary.map((item) => ({
      status: item.status,
      count: item._count.id,
    })),
  };
}

/**
 * Return type for getBranchProfileData
 */
export type BranchProfileData = Awaited<
  ReturnType<typeof getBranchProfileData>
>;
