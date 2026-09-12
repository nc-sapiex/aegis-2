import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession } from "@/lib/auth";

/**
 * Data Access Layer for RBIA analytics.
 *
 * Provides aggregate analytics data for the board analytics tab
 * and score visualization pages.
 *
 * SECURITY: tenantId MUST come from session only, never from URL/body/query.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ScoreDisplayData = {
  compositeScore: number; // 0.0-1.0
  ratingBand: string; // "VERY_GOOD" | "GOOD" | "SATISFACTORY" | "MODERATE" | "POOR"
  moduleScores: Record<string, number>; // e.g. { "OPS": 0.85, "CREDIT": 0.72 }
  scoringTreeSnapshot: unknown | null; // Full JSONB tree for drill-down
  frozenAt: Date | null;
};

export type RbiaAnalyticsSummary = {
  totalAudited: number;
  averageComposite: number; // 0.0-1.0
  ratingDistribution: Record<string, number>; // e.g. { VERY_GOOD: 3, GOOD: 5, ... }
  moduleAverages: Record<string, number>; // Average score per module code across all branches
  scores: Array<{
    branchId: string;
    branchName: string;
    compositeScore: number;
    ratingBand: string;
    moduleScores: Record<string, number>;
  }>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute average score per module code across multiple BranchRbiaScore records.
 * Handles varying module sets gracefully (only averages modules that appear).
 */
function computeModuleAverages(
  allModuleScores: Record<string, number>[],
): Record<string, number> {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};

  for (const ms of allModuleScores) {
    for (const [code, score] of Object.entries(ms)) {
      sums[code] = (sums[code] ?? 0) + score;
      counts[code] = (counts[code] ?? 0) + 1;
    }
  }

  const averages: Record<string, number> = {};
  for (const code of Object.keys(sums)) {
    averages[code] = sums[code] / counts[code];
  }
  return averages;
}

// ─── getScoreDisplayData ─────────────────────────────────────────────────────

/**
 * Returns the BranchRbiaScore data for a specific engagement,
 * formatted for the score visualization page (gauge + module breakdown).
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Engagement UUID
 * @returns Score display data or null if no score record exists
 */
export async function getScoreDisplayData(
  session: AuthSession,
  engagementId: string,
): Promise<ScoreDisplayData | null> {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const score = await db.branchRbiaScore.findUnique({
    where: { engagementId },
    select: {
      tenantId: true,
      compositeScore: true,
      ratingBand: true,
      moduleScores: true,
      scoringTreeSnapshot: true,
      frozenAt: true,
    },
  });

  if (!score) return null;

  // Defense-in-depth: verify tenant ownership
  if (score.tenantId !== tenantId) return null;

  return {
    compositeScore: Number(score.compositeScore),
    ratingBand: score.ratingBand,
    moduleScores: score.moduleScores as Record<string, number>,
    scoringTreeSnapshot: score.scoringTreeSnapshot,
    frozenAt: score.frozenAt,
  };
}

// ─── getRbiaAnalyticsSummary ─────────────────────────────────────────────────

/**
 * Returns aggregate RBIA analytics for all frozen BranchRbiaScore records
 * for the tenant. Used by the board analytics tab (Plan 23-05).
 *
 * @param session - Authenticated session (tenantId source)
 */
export async function getRbiaAnalyticsSummary(
  session: AuthSession,
): Promise<RbiaAnalyticsSummary> {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const rows = await db.branchRbiaScore.findMany({
    where: {
      tenantId,
      frozenAt: { not: null },
    },
    select: {
      branchId: true,
      compositeScore: true,
      ratingBand: true,
      moduleScores: true,
      engagement: {
        select: {
          branch: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: { frozenAt: "desc" },
  });

  if (rows.length === 0) {
    return {
      totalAudited: 0,
      averageComposite: 0,
      ratingDistribution: {},
      moduleAverages: {},
      scores: [],
    };
  }

  // Compute rating distribution
  const ratingDistribution: Record<string, number> = {};
  for (const row of rows) {
    const band = row.ratingBand;
    ratingDistribution[band] = (ratingDistribution[band] ?? 0) + 1;
  }

  // Compute average composite score
  const totalComposite = rows.reduce(
    (sum, row) => sum + Number(row.compositeScore),
    0,
  );
  const averageComposite = totalComposite / rows.length;

  // Compute average module scores across all branches
  const moduleAverages = computeModuleAverages(
    rows.map((r) => r.moduleScores as Record<string, number>),
  );

  // Build scores array
  const scores = rows.map((row) => ({
    branchId: row.branchId,
    branchName: row.engagement?.branch?.name ?? "Unknown Branch",
    compositeScore: Number(row.compositeScore),
    ratingBand: row.ratingBand,
    moduleScores: row.moduleScores as Record<string, number>,
  }));

  return {
    totalAudited: rows.length,
    averageComposite,
    ratingDistribution,
    moduleAverages,
    scores,
  };
}

// ─── getRbiaAnalyticsByPeriod ────────────────────────────────────────────────

/**
 * Same as getRbiaAnalyticsSummary but filtered by frozenAt date range.
 * For period selector in board analytics.
 *
 * @param session - Authenticated session (tenantId source)
 * @param startDate - Period start (inclusive)
 * @param endDate - Period end (inclusive)
 */
export async function getRbiaAnalyticsByPeriod(
  session: AuthSession,
  startDate: Date,
  endDate: Date,
): Promise<RbiaAnalyticsSummary> {
  const tenantId = session.user.tenantId;
  const db = prismaForTenant(tenantId);

  const rows = await db.branchRbiaScore.findMany({
    where: {
      tenantId,
      frozenAt: { not: null, gte: startDate, lte: endDate },
    },
    select: {
      branchId: true,
      compositeScore: true,
      ratingBand: true,
      moduleScores: true,
      engagement: {
        select: {
          branch: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: { frozenAt: "desc" },
  });

  if (rows.length === 0) {
    return {
      totalAudited: 0,
      averageComposite: 0,
      ratingDistribution: {},
      moduleAverages: {},
      scores: [],
    };
  }

  const ratingDistribution: Record<string, number> = {};
  for (const row of rows) {
    const band = row.ratingBand;
    ratingDistribution[band] = (ratingDistribution[band] ?? 0) + 1;
  }

  const totalComposite = rows.reduce(
    (sum, row) => sum + Number(row.compositeScore),
    0,
  );
  const averageComposite = totalComposite / rows.length;

  const moduleAverages = computeModuleAverages(
    rows.map((r) => r.moduleScores as Record<string, number>),
  );

  const scores = rows.map((row) => ({
    branchId: row.branchId,
    branchName: row.engagement?.branch?.name ?? "Unknown Branch",
    compositeScore: Number(row.compositeScore),
    ratingBand: row.ratingBand,
    moduleScores: row.moduleScores as Record<string, number>,
  }));

  return {
    totalAudited: rows.length,
    averageComposite,
    ratingDistribution,
    moduleAverages,
    scores,
  };
}
