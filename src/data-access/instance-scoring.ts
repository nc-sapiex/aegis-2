import "server-only";
import { prismaForTenant } from "./prisma";
import { withAuditedMutation, userActor } from "./audited-mutation";
import type { AuthSession as Session } from "@/lib/auth";
import {
  computeModuleComplianceScores,
  type ResponseTally,
  type QuestionComplianceResult,
} from "@/lib/instance-scoring";
import { SCORE_VALUES } from "@/lib/rbia-scoring-engine";

/**
 * Data Access Layer for Instance-Based Scoring.
 *
 * Bridges Phase 30 AccountExamResponse records to the Phase 20-23 RBIA
 * scoring engine. Computes per-question compliance percentages, maps them
 * to ScoreLabel values, and upserts ExaminationResponse records on credit
 * module leaf nodes so the existing scoring engine consumes them transparently.
 *
 * Design:
 * - All functions enforce tenant isolation via session.user.tenantId
 * - Uses prismaForTenant() for consistent connection management
 * - Bridge strategy: compute module-level weighted compliance score from all
 *   question results, then distribute that ScoreLabel to all leaf nodes under
 *   the credit module's ExaminationNode subtree
 *
 * Consumers: freeze action (pre-transaction sync), RBIA scoring UI
 *
 * SECURITY: tenantId MUST come from session only, never from URL/body/query.
 */

function extractTenantId(session: Session): string {
  return session.user.tenantId;
}

// Re-export types for consumers
export type { ResponseTally, QuestionComplianceResult };

// ─── getQuestionResponseTallies ───────────────────────────────────────────────

/**
 * Returns AccountExamResponse tallies grouped by questionId for a credit module.
 *
 * Fetches all active questions for the module, then all AccountExamResponse
 * records for this engagement + those question IDs. Groups responses by
 * questionId in a Map — questions with zero responses get empty arrays.
 * Including empty arrays is critical for "Not Examined" display in the UI
 * and ensures computeModuleComplianceScores returns null (not 0%) for
 * unexamined questions.
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Engagement UUID
 * @param moduleCode - Credit module code (e.g., "CRD-HLN")
 * @returns Map of questionId → ResponseTally[] (empty arrays for unexamined questions)
 */
export async function getQuestionResponseTallies(
  session: Session,
  engagementId: string,
  moduleCode: string,
): Promise<Map<string, ResponseTally[]>> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  // Get all active questions for this module
  const questions = await db.examinationQuestion.findMany({
    where: { tenantId, moduleCode, isActive: true },
    select: { id: true },
  });

  const questionIds = questions.map((q) => q.id);

  // Initialize Map with empty arrays for all questions (includes Not Examined)
  const tallyMap = new Map<string, ResponseTally[]>();
  for (const qId of questionIds) {
    tallyMap.set(qId, []);
  }

  if (questionIds.length === 0) return tallyMap;

  // Fetch all AccountExamResponse records for this engagement + these questions
  const responses = await db.accountExamResponse.findMany({
    where: { engagementId, questionId: { in: questionIds }, tenantId },
    select: { questionId: true, status: true },
  });

  // Group responses by questionId
  for (const r of responses) {
    const existing = tallyMap.get(r.questionId) ?? [];
    existing.push({ status: r.status as "COMPLIANT" | "VIOLATION" });
    tallyMap.set(r.questionId, existing);
  }

  return tallyMap;
}

// ─── computeAndApplyInstanceScores ───────────────────────────────────────────

/**
 * Bridge function: computes compliance scores for a credit module and upserts
 * ExaminationResponse records on the module's leaf ExaminationNodes.
 *
 * Strategy (module-level aggregation):
 * ExaminationQuestion and ExaminationNode are separate hierarchies. Questions
 * are account-level checks; nodes are the RBIA examination tree. The bridge
 * works at the module level:
 *
 *   1. Get response tallies via getQuestionResponseTallies
 *   2. Compute per-question compliance results via computeModuleComplianceScores
 *   3. Compute weighted average ScoreLabel for the module from all results
 *   4. Find all active leaf ExaminationNodes under this credit module
 *   5. Upsert ExaminationResponse with the computed ScoreLabel on each leaf
 *
 * This makes the existing computeModuleScore/computeCompositeScore functions
 * produce correct roll-up scores from compliance-derived ScoreLabels without
 * any changes to the scoring engine.
 *
 * Questions with null scoreLabel (Not Examined) are excluded from the weighted
 * average denominator — consistent with rbia-scoring-engine.ts unscored-leaf
 * exclusion.
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Engagement UUID
 * @param moduleCode - Credit module code (e.g., "CRD-HLN")
 * @returns scoredLeafCount (number of leaf nodes updated) and moduleScore (0–1 or null)
 */
export async function computeAndApplyInstanceScores(
  session: Session,
  engagementId: string,
  moduleCode: string,
): Promise<{ scoredLeafCount: number; moduleScore: number | null }> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  // Step 1: Get response tallies and compute per-question compliance
  const tallies = await getQuestionResponseTallies(
    session,
    engagementId,
    moduleCode,
  );
  const complianceResults = computeModuleComplianceScores(tallies);

  // Step 2: Get question weights for weighted average
  const questions = await db.examinationQuestion.findMany({
    where: { tenantId, moduleCode, isActive: true },
    select: { id: true, weight: true },
  });
  const questionWeightMap = new Map(
    questions.map((q) => [q.id, Number(q.weight)]),
  );

  // Step 3: Compute weighted average numeric score from question compliance
  // Skip questions with null scoreLabel (Not Examined) — exclude from denominator
  let weightedSum = 0;
  let totalWeight = 0;

  for (const result of complianceResults) {
    if (result.scoreLabel === null) continue; // Not Examined — skip
    const score = SCORE_VALUES[result.scoreLabel];
    const weight = questionWeightMap.get(result.questionId) ?? 1;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  // No questions have been examined — nothing to apply
  if (totalWeight === 0) {
    return { scoredLeafCount: 0, moduleScore: null };
  }

  const moduleScore = weightedSum / totalWeight;

  // Step 4: Map the module-level numeric score back to a ScoreLabel
  // Convert to percentage form and use mapComplianceToScoreLabel
  const { mapComplianceToScoreLabel } = await import("@/lib/instance-scoring");
  const modulePercentage = Math.round(moduleScore * 100);
  const moduleScoreLabel = mapComplianceToScoreLabel(modulePercentage);

  // Find the credit module's ExaminationNode (depth 1 node with this code)
  const moduleNode = await db.examinationNode.findFirst({
    where: { tenantId, code: moduleCode, depth: 1, isActive: true },
    select: { id: true, path: true },
  });

  if (!moduleNode || !moduleScoreLabel) {
    return { scoredLeafCount: 0, moduleScore: null };
  }

  // Step 5: Find all active leaf nodes under this credit module
  // Path format: "rootId.moduleId.subId.leafId" — match on path prefix
  const leafNodes = await db.examinationNode.findMany({
    where: {
      tenantId,
      isLeaf: true,
      isActive: true,
      path: { startsWith: moduleNode.path + "." },
    },
    select: { id: true },
  });

  // Step 6: Upsert ExaminationResponse for each leaf node with the module
  // ScoreLabel. This makes the existing scoring engine "see" the instance-based
  // scores. ExaminationResponse carries an audit trigger, and this runs outside
  // the freeze transaction by design, so the leaf upserts get their own audited
  // transaction attributed to the user driving the sync (the freeze actor).
  await withAuditedMutation(
    userActor(session),
    "examination_response.instance_scored",
    async (tx) => {
      for (const leaf of leafNodes) {
        await tx.examinationResponse.upsert({
          where: {
            engagementId_nodeId: { engagementId, nodeId: leaf.id },
          },
          create: {
            tenantId,
            engagementId,
            nodeId: leaf.id,
            score: SCORE_VALUES[moduleScoreLabel],
            scoreLabel: moduleScoreLabel,
            // Auto-scoring an item asserts it applies: clear any prior N/A, or
            // the leaf would carry a score and the N/A flag at once.
            isNotApplicable: false,
            notApplicableReason: null,
            workingNotes: `Auto-scored from instance-based examination: ${modulePercentage}% compliance across ${complianceResults.length} question(s)`,
            flagForObservation: false,
            flagForActionPoint: false,
            respondedAt: new Date(),
          },
          update: {
            score: SCORE_VALUES[moduleScoreLabel],
            scoreLabel: moduleScoreLabel,
            // Auto-scoring an item asserts it applies: clear any prior N/A, or
            // the leaf would carry a score and the N/A flag at once.
            isNotApplicable: false,
            notApplicableReason: null,
            workingNotes: `Auto-scored from instance-based examination: ${modulePercentage}% compliance across ${complianceResults.length} question(s)`,
            respondedAt: new Date(),
          },
        });
      }
    },
  );

  const scoredLeafCount = leafNodes.length;

  return { scoredLeafCount, moduleScore };
}

// ─── getCreditModuleCodes ─────────────────────────────────────────────────────

/**
 * Returns distinct module codes that have sampled loan account data for an engagement.
 *
 * Uses LoanAccount.isSampled = true to identify which credit modules have
 * been examined via sample-based audit. Only modules with sampled accounts
 * should have instance-based scores computed.
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Engagement UUID
 * @returns Array of distinct moduleCode strings (e.g., ["CRD-HLN", "CRD-GLD"])
 */
export async function getCreditModuleCodes(
  session: Session,
  engagementId: string,
): Promise<string[]> {
  const tenantId = extractTenantId(session);
  const db = prismaForTenant(tenantId);

  const modules = await db.loanAccount.findMany({
    where: { engagementId, isSampled: true, tenantId },
    select: { moduleCode: true },
    distinct: ["moduleCode"],
  });

  return modules.map((m) => m.moduleCode);
}

// ─── syncAllInstanceScores ────────────────────────────────────────────────────

/**
 * Convenience function that syncs instance-based scores for all credit modules
 * with sampled data in an engagement.
 *
 * Calls getCreditModuleCodes to find which modules have sampled accounts, then
 * calls computeAndApplyInstanceScores for each. Designed to run before the
 * freeze transaction so that ExaminationResponse records are up-to-date when
 * the scoring tree snapshot is built.
 *
 * @param session - Authenticated session (tenantId source)
 * @param engagementId - Engagement UUID
 * @returns modulesProcessed count and totalScoredLeaves across all modules
 */
export async function syncAllInstanceScores(
  session: Session,
  engagementId: string,
): Promise<{ modulesProcessed: number; totalScoredLeaves: number }> {
  const moduleCodes = await getCreditModuleCodes(session, engagementId);

  let totalScoredLeaves = 0;

  for (const moduleCode of moduleCodes) {
    const result = await computeAndApplyInstanceScores(
      session,
      engagementId,
      moduleCode,
    );
    totalScoredLeaves += result.scoredLeafCount;
  }

  return {
    modulesProcessed: moduleCodes.length,
    totalScoredLeaves,
  };
}
