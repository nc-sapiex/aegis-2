import "server-only";
import { prismaForTenant } from "./prisma";
import type { AuthSession as Session } from "@/lib/auth";

/**
 * Data Access Layer for RBIA scoring.
 *
 * Follows the canonical DAL 5-step pattern:
 * 1. Accept session object (tenantId source)
 * 2. Use prismaForTenant() for isolation
 * 3. Add explicit WHERE tenantId (belt-and-suspenders)
 * 4. Runtime assertions where applicable
 * 5. Return typed data with Decimal → number conversion
 *
 * SECURITY: tenantId MUST come from session only, never from URL/body/query.
 */

function extractTenantId(session: Session): string {
  return session.user.tenantId;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type BranchRbiaScoreData = {
  id: string;
  compositeScore: number;
  ratingBand: string;
  moduleScores: Record<string, number>;
  scoringTreeSnapshot: unknown | null; // JSONB — parsed ScoredNodeSnapshot tree
  frozenAt: Date | null;
  frozenById: string | null;
  engagementId: string;
};

/**
 * Per-module progress row — used for scoring panel display.
 * responseCount = number of leaf nodes with a response (regardless of score).
 * totalLeafCount = total active leaf nodes under this module.
 * scoredCount = number of leaf nodes that have a non-null score value.
 */
export type EngagementModuleScoreRow = {
  moduleCode: string;
  moduleName: string;
  nodeId: string;
  responseCount: number;
  totalLeafCount: number;
  scoredCount: number;
};

// ─── getBranchScoreHistory ────────────────────────────────────────────────────

/**
 * Returns all frozen BranchRbiaScore records for a branch, ordered most recent
 * first. Draft (frozenAt === null) records are excluded.
 *
 * @param session - Authenticated session (tenantId source)
 * @param branchId - Branch UUID to query
 */
export async function getBranchScoreHistory(
  session: Session,
  branchId: string,
): Promise<BranchRbiaScoreData[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const rows = await db.branchRbiaScore.findMany({
    where: {
      tenantId,
      branchId,
      frozenAt: { not: null },
    },
    select: {
      id: true,
      compositeScore: true,
      ratingBand: true,
      moduleScores: true,
      scoringTreeSnapshot: true,
      frozenAt: true,
      frozenById: true,
      engagementId: true,
    },
    orderBy: { frozenAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    compositeScore: Number(row.compositeScore),
    ratingBand: row.ratingBand,
    moduleScores: row.moduleScores as Record<string, number>,
    scoringTreeSnapshot: row.scoringTreeSnapshot ?? null,
    frozenAt: row.frozenAt,
    frozenById: row.frozenById,
    engagementId: row.engagementId,
  }));
}

// ─── getEngagementBranchScore ─────────────────────────────────────────────────

/**
 * Returns the BranchRbiaScore for a specific engagement (frozen or draft).
 * Uses findUnique on the @unique engagementId field. Validates tenantId
 * at the application level as defense-in-depth.
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Engagement UUID
 */
export async function getEngagementBranchScore(
  session: Session,
  engagementId: string,
): Promise<BranchRbiaScoreData | null> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const row = await db.branchRbiaScore.findUnique({
    where: { engagementId },
    select: {
      id: true,
      tenantId: true,
      compositeScore: true,
      ratingBand: true,
      moduleScores: true,
      scoringTreeSnapshot: true,
      frozenAt: true,
      frozenById: true,
      engagementId: true,
    },
  });

  if (!row) return null;

  // Defense-in-depth: verify tenant ownership before returning data
  if (row.tenantId !== tenantId) return null;

  return {
    id: row.id,
    compositeScore: Number(row.compositeScore),
    ratingBand: row.ratingBand,
    moduleScores: row.moduleScores as Record<string, number>,
    scoringTreeSnapshot: row.scoringTreeSnapshot ?? null,
    frozenAt: row.frozenAt,
    frozenById: row.frozenById,
    engagementId: row.engagementId,
  };
}

// ─── getEngagementModuleScores ────────────────────────────────────────────────

/**
 * Returns per-module progress counts for an engagement.
 * Uses bulk queries + TypeScript grouping to avoid N+1 per module.
 *
 * Strategy:
 *   Q1 — Load all depth-1 (module-level) ExaminationNodes for the tenant
 *   Q2 — Load all active leaf nodes for the tenant (id + path)
 *   Q3 — Load all ExaminationResponses for the engagement (nodeId + score)
 *   Then join in memory to build progress rows.
 *
 * Tenant isolation for responses: enforced via Q2 scoping — only leaf nodeIds
 * belonging to this tenant are in the join set.
 *
 * Instance-based scoring (v7.0): Credit module leaf nodes scored via
 * computeAndApplyInstanceScores will have ExaminationResponse records
 * with compliance-derived ScoreLabels. These are counted in scoredCount
 * alongside manually-scored nodes — no special handling needed. The
 * syncAllInstanceScores call in freezeRbiaScore ensures instance-scored
 * modules appear here with non-null score values before the freeze snapshot.
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Engagement UUID
 */
export async function getEngagementModuleScores(
  session: Session,
  engagementId: string,
): Promise<EngagementModuleScoreRow[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  // Q1: Module-level nodes (depth 1)
  const modules = await db.examinationNode.findMany({
    where: { tenantId, depth: 1, isActive: true },
    select: { id: true, code: true, name: true },
  });

  if (modules.length === 0) return [];

  // Q2: All active leaf nodes for tenant (id + path for grouping by module)
  const leafNodes = await db.examinationNode.findMany({
    where: { tenantId, isActive: true, isLeaf: true },
    select: { id: true, path: true },
  });

  // Q3: All responses for this engagement
  const responses = await db.examinationResponse.findMany({
    where: { engagementId },
    select: { nodeId: true, score: true },
  });

  // Build lookup sets for O(1) response checks
  const respondedNodeIds = new Set(responses.map((r) => r.nodeId));
  const scoredNodeIds = new Set(
    responses.filter((r) => r.score !== null).map((r) => r.nodeId),
  );

  // Group leaf nodes by their module (first path segment = module node id)
  // Path format: "moduleId.subId.leafId" or "moduleId.leafId"
  const leafsByModule = new Map<string, string[]>();
  for (const leaf of leafNodes) {
    // The path starts with the root node id; module is at index 1 (depth 1)
    const segments = leaf.path.split(".");
    // depth-1 module id is segments[1] (segments[0] is root)
    const moduleId = segments.length >= 2 ? segments[1] : null;
    if (!moduleId) continue;
    const existing = leafsByModule.get(moduleId) ?? [];
    existing.push(leaf.id);
    leafsByModule.set(moduleId, existing);
  }

  // Build result rows
  return modules.map((mod) => {
    const leafIds = leafsByModule.get(mod.id) ?? [];
    const totalLeafCount = leafIds.length;
    const responseCount = leafIds.filter((id) =>
      respondedNodeIds.has(id),
    ).length;
    const scoredCount = leafIds.filter((id) => scoredNodeIds.has(id)).length;

    return {
      moduleCode: mod.code,
      moduleName: mod.name,
      nodeId: mod.id,
      responseCount,
      totalLeafCount,
      scoredCount,
    };
  });
}
