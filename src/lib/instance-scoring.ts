/**
 * Instance-Based Compliance Scoring — Pure TypeScript
 *
 * Bridges Phase 30 AccountExamResponse records to the Phase 20-23 RBIA
 * scoring engine. Computes per-question compliance percentages and maps
 * them to ScoreLabel values that the existing scoring engine consumes.
 *
 * Design constraints:
 * - Pure functions, zero side effects
 * - No database or I/O dependencies
 * - Produces ScoreLabel values compatible with rbia-scoring-engine.ts
 *
 * Consumers: Plan 31-02 (DAL wiring), freeze action
 */

import type { ScoreLabel } from "@/generated/prisma/enums";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal response record from AccountExamResponse.
 * Only the status field is needed for compliance computation.
 */
export type ResponseTally = {
  status: "COMPLIANT" | "VIOLATION";
};

/**
 * Per-question compliance result produced by computeModuleComplianceScores.
 * Includes raw counts for transparency and the derived ScoreLabel for the
 * existing scoring engine.
 */
export type QuestionComplianceResult = {
  questionId: string;
  /** Percentage of accounts compliant. null = no responses (Not Examined). */
  compliancePercentage: number | null;
  /** ScoreLabel for the existing scoring engine. null when compliance is null. */
  scoreLabel: ScoreLabel | null;
  totalResponses: number;
  compliantCount: number;
  violationCount: number;
};

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Compute the compliance percentage for a single question across all sampled
 * accounts that have a response for that question.
 *
 * Formula: (COMPLIANT responses / total responses) × 100, rounded to integer.
 *
 * Returns null for zero responses — distinguishes "Not Examined" from 0%
 * compliant. Only accounts with a recorded response are included; accounts
 * that were never examined for the question are excluded from the denominator.
 *
 * @param responses - Array of AccountExamResponse status values for the question
 * @returns Integer compliance percentage (0–100), or null if no responses
 */
export function computeCompliancePercentage(
  responses: ResponseTally[],
): number | null {
  if (responses.length === 0) return null;

  const compliantCount = responses.filter(
    (r) => r.status === "COMPLIANT",
  ).length;

  return Math.round((compliantCount / responses.length) * 100);
}

/**
 * Map a compliance percentage to the 4-point RBIA ScoreLabel scale.
 *
 * Thresholds per RBIA Policy 2020 and Phase 31 CONTEXT.md decisions:
 * - 100%         → FULLY_COMPLIANT
 * - 75% – 99%   → LARGELY_COMPLIANT  (75 inclusive)
 * - 50% – 74%   → PARTIALLY_COMPLIANT (50 inclusive)
 * - < 50%        → NON_COMPLIANT
 *
 * Returns null when compliance is null (Not Examined — no ScoreLabel assigned).
 *
 * @param compliancePercentage - Integer percentage (0–100), or null
 * @returns ScoreLabel enum value, or null
 */
export function mapComplianceToScoreLabel(
  compliancePercentage: number | null,
): ScoreLabel | null {
  if (compliancePercentage === null) return null;

  if (compliancePercentage === 100) return "FULLY_COMPLIANT";
  if (compliancePercentage >= 75) return "LARGELY_COMPLIANT";
  if (compliancePercentage >= 50) return "PARTIALLY_COMPLIANT";
  return "NON_COMPLIANT";
}

/**
 * Aggregate compliance scores for all questions in a module.
 *
 * Takes a Map of questionId → array of AccountExamResponse tallies across all
 * sampled accounts. For each question, computes the compliance percentage and
 * maps it to a ScoreLabel.
 *
 * Questions with no responses (empty arrays) receive null compliance and null
 * scoreLabel — they appear as "Not Examined" in the UI and are excluded from
 * the scoring engine denominator (consistent with how unscored leaf nodes are
 * handled in rbia-scoring-engine.ts).
 *
 * Results are sorted by questionId for deterministic ordering.
 *
 * @param questionResponses - Map of questionId → ResponseTally[]
 * @returns Array of QuestionComplianceResult sorted by questionId
 */
export function computeModuleComplianceScores(
  questionResponses: Map<string, ResponseTally[]>,
): QuestionComplianceResult[] {
  const results: QuestionComplianceResult[] = [];

  for (const [questionId, responses] of questionResponses) {
    const compliantCount = responses.filter(
      (r) => r.status === "COMPLIANT",
    ).length;
    const violationCount = responses.filter(
      (r) => r.status === "VIOLATION",
    ).length;
    const totalResponses = responses.length;

    const compliancePercentage = computeCompliancePercentage(responses);
    const scoreLabel = mapComplianceToScoreLabel(compliancePercentage);

    results.push({
      questionId,
      compliancePercentage,
      scoreLabel,
      totalResponses,
      compliantCount,
      violationCount,
    });
  }

  // Sort by questionId for deterministic, predictable output
  results.sort((a, b) => a.questionId.localeCompare(b.questionId));

  return results;
}
