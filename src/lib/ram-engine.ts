/**
 * RAM (Risk Assessment Model) Computation Engine
 *
 * Pure functions for computing branch risk assessments.
 * Based on RBIA Policy 2020 §7.3-7.6 and §9.1.
 *
 * Scoring: 1 (lowest risk) to 5 (highest risk) per parameter.
 * Composite: Weighted average of all parameter scores.
 * Risk Category: HIGH (>3.5), MEDIUM (2.5-3.5), LOW (<2.5)
 * Audit Frequency: HIGH→12mo, MEDIUM→18mo, LOW→24mo
 */

export interface RamScoreInput {
  paramCode: string;
  score: number; // 1-5
  weight: number; // 0-1 (sum of all weights ≈ 1.0)
}

export interface RamComputationResult {
  compositeScore: number; // Weighted average, 2 decimal places
  riskCategory: "HIGH" | "MEDIUM" | "LOW";
  auditFrequency: number; // Months: 12, 18, or 24
}

export interface RamComputationResultWithUplift extends RamComputationResult {
  rawCompositeScore: number; // Score before uplift
  repeatUpliftApplied: boolean; // Whether 1.5× was applied
  repeatUpliftFactor: number; // 1.0 or 1.5
  repeatFindingCount: number; // Number of repeat findings detected
}

/**
 * Compute composite score as weighted average.
 * Formula: Σ(score_i × weight_i) / Σ(weight_i)
 *
 * Normalizes by total weight to handle cases where weights
 * don't sum exactly to 1.0 (e.g., some params inactive).
 */
export function computeCompositeScore(scores: RamScoreInput[]): number {
  if (scores.length === 0) {
    throw new Error("Cannot compute composite score with zero parameters");
  }

  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) {
    throw new Error("Total weight cannot be zero");
  }

  const weightedSum = scores.reduce((sum, s) => sum + s.score * s.weight, 0);
  const composite = weightedSum / totalWeight;

  return Math.round(composite * 100) / 100; // 2 decimal places
}

/**
 * Configurable RAM thresholds (R8).
 * Defaults per RBIA Policy §7.5/§7.6; can be overridden per tenant.
 */
export type RamThresholds = {
  highRiskMin: number; // Score above this → HIGH risk (default 3.5)
  mediumRiskMin: number; // Score above this → MEDIUM risk (default 2.5)
  highFrequency: number; // Months for HIGH risk (default 12)
  mediumFrequency: number; // Months for MEDIUM risk (default 18)
  lowFrequency: number; // Months for LOW risk (default 24)
};

export const DEFAULT_RAM_THRESHOLDS: RamThresholds = {
  highRiskMin: 3.5,
  mediumRiskMin: 2.5,
  highFrequency: 12,
  mediumFrequency: 18,
  lowFrequency: 24,
};

/**
 * Derive risk category from composite score.
 * Per RBIA Policy §7.5 (configurable via thresholds):
 *   - > highRiskMin  → HIGH risk
 *   - >= mediumRiskMin → MEDIUM risk
 *   - < mediumRiskMin  → LOW risk
 */
export function deriveRiskCategory(
  compositeScore: number,
  thresholds: RamThresholds = DEFAULT_RAM_THRESHOLDS,
): "HIGH" | "MEDIUM" | "LOW" {
  if (compositeScore > thresholds.highRiskMin) return "HIGH";
  if (compositeScore >= thresholds.mediumRiskMin) return "MEDIUM";
  return "LOW";
}

/**
 * Derive audit frequency from risk category.
 * Per RBIA Policy §7.6 (configurable via thresholds):
 *   - HIGH   → highFrequency months
 *   - MEDIUM → mediumFrequency months
 *   - LOW    → lowFrequency months
 */
export function deriveAuditFrequency(
  riskCategory: "HIGH" | "MEDIUM" | "LOW",
  thresholds: RamThresholds = DEFAULT_RAM_THRESHOLDS,
): number {
  const FREQUENCY_MAP: Record<string, number> = {
    HIGH: thresholds.highFrequency,
    MEDIUM: thresholds.mediumFrequency,
    LOW: thresholds.lowFrequency,
  };
  return FREQUENCY_MAP[riskCategory] ?? thresholds.mediumFrequency;
}

/**
 * Full RAM computation pipeline.
 * Takes scored parameters, returns composite score + risk category + frequency.
 */
export function computeRam(scores: RamScoreInput[]): RamComputationResult {
  const compositeScore = computeCompositeScore(scores);
  const riskCategory = deriveRiskCategory(compositeScore);
  const auditFrequency = deriveAuditFrequency(riskCategory);

  return { compositeScore, riskCategory, auditFrequency };
}

/**
 * Compute RAM assessment with repeat finding uplift.
 *
 * Pipeline:
 * 1. Compute raw composite score (weighted average)
 * 2. Apply repeat finding uplift if applicable (1.5×)
 * 3. Derive risk category from ADJUSTED score
 * 4. Derive audit frequency from risk category
 *
 * @param scores - Individual parameter scores
 * @param repeatUplift - Optional uplift from repeat detection
 * @returns Full computation result with uplift metadata
 */
export function computeRamWithUplift(
  scores: RamScoreInput[],
  repeatUplift?: {
    adjustedScore: number;
    upliftApplied: boolean;
    upliftFactor: number;
    repeatCount: number;
  },
): RamComputationResultWithUplift {
  const rawComposite = computeCompositeScore(scores);

  const finalScore = repeatUplift?.upliftApplied
    ? repeatUplift.adjustedScore
    : rawComposite;

  const riskCategory = deriveRiskCategory(finalScore);
  const auditFrequency = deriveAuditFrequency(riskCategory);

  return {
    compositeScore: finalScore,
    riskCategory,
    auditFrequency,
    rawCompositeScore: rawComposite,
    repeatUpliftApplied: repeatUplift?.upliftApplied ?? false,
    repeatUpliftFactor: repeatUplift?.upliftFactor ?? 1.0,
    repeatFindingCount: repeatUplift?.repeatCount ?? 0,
  };
}
