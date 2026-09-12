import "server-only";
import { prismaForTenant } from "@/data-access/prisma";

export interface RepeatFindingSummary {
  branchId: string;
  hasRepeatFindings: boolean;
  repeatCount: number;
  totalPriorFindings: number;
  repeatRatio: number; // 0.0 to 1.0
  repeatFindings: Array<{
    currentObservationId: string;
    priorObservationId: string;
    title: string;
    severity: string;
  }>;
}

/**
 * Detect repeat findings for a branch by checking current audit observations
 * against closed observations from prior audits at the same branch.
 *
 * Two methods of detection:
 * 1. Explicit: Observation.repeatOfId is set (user confirmed repeat)
 * 2. Implicit: Title similarity > 0.5 via pg_trgm (same as detect.ts)
 *
 * For RAM purposes, we use BOTH methods.
 *
 * @param tenantId - Tenant ID
 * @param branchId - Branch being assessed
 * @param currentEngagementId - Current audit engagement (to exclude from "prior" query)
 * @returns RepeatFindingSummary
 */
export async function detectRepeatFindingsForBranch(
  tenantId: string,
  branchId: string,
  currentEngagementId?: string,
): Promise<RepeatFindingSummary> {
  const db = prismaForTenant(tenantId);

  // Get explicitly linked repeat findings
  const explicitRepeats = await db.observation.findMany({
    where: {
      tenantId,
      branchId,
      repeatOfId: { not: null },
      ...(currentEngagementId && { engagementId: currentEngagementId }),
    },
    select: {
      id: true,
      title: true,
      severity: true,
      repeatOfId: true,
    },
  });

  // Get current audit findings (from most recent engagement or specified one)
  const currentFindings = await db.observation.findMany({
    where: {
      tenantId,
      branchId,
      status: { in: ["DRAFT", "SUBMITTED", "REVIEWED", "ISSUED"] },
      ...(currentEngagementId && { engagementId: currentEngagementId }),
    },
    select: { id: true, title: true, severity: true },
  });

  // Get total prior findings (CLOSED observations at this branch)
  const priorFindingsCount = await db.observation.count({
    where: {
      tenantId,
      branchId,
      status: "CLOSED",
    },
  });

  // Implicit detection via pg_trgm for findings without explicit repeatOfId
  let implicitRepeats: Array<{
    currentObservationId: string;
    priorObservationId: string;
    title: string;
    severity: string;
  }> = [];

  // Only check findings that don't already have explicit repeat link
  const unlinkedFindings = currentFindings.filter(
    (f) => !explicitRepeats.some((r) => r.id === f.id),
  );

  if (unlinkedFindings.length > 0 && priorFindingsCount > 0) {
    // Check each unlinked finding against closed observations
    for (const finding of unlinkedFindings) {
      const matches = await db.$queryRaw<
        Array<{ id: string; title: string; similarity_score: number }>
      >`
        SELECT id, title, similarity(title, ${finding.title}) as similarity_score
        FROM "Observation"
        WHERE "tenantId" = ${tenantId}::uuid
          AND "branchId" = ${branchId}::uuid
          AND status = 'CLOSED'
          AND similarity(title, ${finding.title}) > 0.5
        ORDER BY similarity_score DESC
        LIMIT 1
      `;

      if (matches.length > 0) {
        implicitRepeats.push({
          currentObservationId: finding.id,
          priorObservationId: matches[0].id,
          title: finding.title,
          severity: finding.severity,
        });
      }
    }
  }

  // Combine explicit and implicit
  const allRepeats = [
    ...explicitRepeats.map((r) => ({
      currentObservationId: r.id,
      priorObservationId: r.repeatOfId!,
      title: r.title,
      severity: r.severity,
    })),
    ...implicitRepeats,
  ];

  // Deduplicate by currentObservationId
  const uniqueRepeats = Array.from(
    new Map(allRepeats.map((r) => [r.currentObservationId, r])).values(),
  );

  const repeatCount = uniqueRepeats.length;
  const totalCurrent = currentFindings.length;

  return {
    branchId,
    hasRepeatFindings: repeatCount > 0,
    repeatCount,
    totalPriorFindings: priorFindingsCount,
    repeatRatio: totalCurrent > 0 ? repeatCount / totalCurrent : 0,
    repeatFindings: uniqueRepeats,
  };
}

/**
 * Compute the repeat uplift factor for RAM scoring.
 *
 * Per RBIA Policy §8.9:
 * - If branch has repeat findings → apply 1.5× multiplier to composite score
 * - The multiplier is applied to the final composite, not individual params
 * - Score is capped at 5.0 (max score)
 *
 * @param compositeScore - Raw composite score from RAM engine
 * @param repeatSummary - Repeat finding detection result
 * @returns { adjustedScore, upliftApplied, upliftFactor }
 */
export function computeRepeatUplift(
  compositeScore: number,
  repeatSummary: RepeatFindingSummary,
): {
  adjustedScore: number;
  upliftApplied: boolean;
  upliftFactor: number;
  repeatCount: number;
} {
  const REPEAT_MULTIPLIER = 1.5;
  const MAX_SCORE = 5.0;

  if (!repeatSummary.hasRepeatFindings) {
    return {
      adjustedScore: compositeScore,
      upliftApplied: false,
      upliftFactor: 1.0,
      repeatCount: 0,
    };
  }

  const adjustedScore = Math.min(compositeScore * REPEAT_MULTIPLIER, MAX_SCORE);

  return {
    adjustedScore: Math.round(adjustedScore * 100) / 100,
    upliftApplied: true,
    upliftFactor: REPEAT_MULTIPLIER,
    repeatCount: repeatSummary.repeatCount,
  };
}
