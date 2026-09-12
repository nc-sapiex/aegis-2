/**
 * RBIA Scoring Engine — Pure TypeScript
 *
 * Implements weighted score roll-up from leaf ExaminationNodes through parent
 * nodes to module level, with critical-item cap and rating band assignment.
 *
 * Conforms to RBIA Policy 2020, Section 8.9.1.
 *
 * Design constraints:
 * - Pure functions, zero side effects
 * - No database or I/O dependencies
 * - Import only from Prisma-generated types
 *
 * Consumers: Phase 20 (freeze snapshot), Phase 21 (live UI scoring), Phase 23 (reports)
 */

import type { ScoreLabel } from "@/generated/prisma/enums";

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Maps ScoreLabel enum values to their decimal score equivalents.
 * Source: RBIA Policy 2020, 4-point scoring scale.
 */
export const SCORE_VALUES: Record<ScoreLabel, number> = {
  FULLY_COMPLIANT: 1.0,
  LARGELY_COMPLIANT: 0.75,
  PARTIALLY_COMPLIANT: 0.5,
  NON_COMPLIANT: 0.0,
};

/**
 * Maximum score a module can receive when it contains a critical item
 * scored NON_COMPLIANT. Cap is a ceiling (not a floor) — if raw score is
 * already below 0.5, the cap has no effect.
 */
export const CRITICAL_ITEM_CAP = 0.5;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A node in the ExaminationNode tree with its scoring inputs.
 * Mirrors the Prisma ExaminationNode model fields relevant to scoring.
 */
export type ScoredNode = {
  nodeId: string;
  code: string;
  weight: number;
  isCritical: boolean;
  isLeaf: boolean;
  scoreLabel?: ScoreLabel | null;
  children: ScoredNode[];
};

/**
 * Result from computeNodeScore — includes the numeric score and whether
 * any critical NON_COMPLIANT item was found in the subtree.
 */
export type NodeScoreResult = {
  score: number | null;
  hasCriticalNonCompliant: boolean;
};

/**
 * Rating band labels per RBIA Policy 2020, Section 8.9.1.
 * Applied to composite scores (0.0 – 1.0).
 */
export type RatingBand =
  | "VERY_GOOD"
  | "GOOD"
  | "SATISFACTORY"
  | "MODERATE"
  | "POOR";

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Recursively compute the weighted score for a node and its subtree.
 *
 * Leaf nodes: return SCORE_VALUES[scoreLabel], or null if unscored (N/A).
 * Parent nodes: weighted average of scored children only (N/A items excluded
 * from the denominator). Propagates hasCriticalNonCompliant upward.
 *
 * @param node - The node to score (may be leaf or parent)
 * @returns { score, hasCriticalNonCompliant }
 */
export function computeNodeScore(node: ScoredNode): NodeScoreResult {
  // Leaf: return direct score value
  if (node.isLeaf) {
    const scored = node.scoreLabel != null;
    const score = scored ? SCORE_VALUES[node.scoreLabel!] : null;
    const hasCriticalNonCompliant =
      node.isCritical && node.scoreLabel === "NON_COMPLIANT";
    return { score, hasCriticalNonCompliant };
  }

  // Parent: compute weighted average of children
  let weightedSum = 0;
  let totalWeight = 0;
  let hasCriticalNonCompliant = false;

  for (const child of node.children) {
    const childResult = computeNodeScore(child);

    // Propagate critical flag upward
    if (childResult.hasCriticalNonCompliant) {
      hasCriticalNonCompliant = true;
    }

    // Skip unscored (N/A) children — exclude from denominator
    if (childResult.score === null) continue;

    weightedSum += childResult.score * child.weight;
    totalWeight += child.weight;
  }

  // All children unscored
  if (totalWeight === 0) {
    return { score: null, hasCriticalNonCompliant };
  }

  return {
    score: weightedSum / totalWeight,
    hasCriticalNonCompliant,
  };
}

/**
 * Compute the final score for an examination module (top-level node).
 *
 * Calls computeNodeScore for the weighted roll-up, then applies the
 * critical-item cap at module level only: if any critical item scored
 * NON_COMPLIANT and the raw score exceeds CRITICAL_ITEM_CAP (0.5),
 * the module score is capped at 0.5.
 *
 * The cap is a ceiling — it does NOT raise scores below 0.5.
 *
 * @param moduleNode - The root ScoredNode of the module
 * @returns Capped module score (0.0–1.0), or null if no items scored
 */
export function computeModuleScore(moduleNode: ScoredNode): number | null {
  const { score, hasCriticalNonCompliant } = computeNodeScore(moduleNode);

  if (score === null) return null;

  // Apply critical-item cap (ceiling, not floor)
  if (hasCriticalNonCompliant && score > CRITICAL_ITEM_CAP) {
    return CRITICAL_ITEM_CAP;
  }

  return score;
}

/**
 * Compute the composite score across all examination modules.
 *
 * Weighted average of module scores, excluding modules with null scores
 * (no items scored yet) from the denominator.
 *
 * @param moduleScores - Array of { weight, score } for each module
 * @returns Composite score (0.0–1.0), or null if no modules scored
 */
export function computeCompositeScore(
  moduleScores: Array<{ weight: number; score: number | null }>,
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const { weight, score } of moduleScores) {
    if (score === null) continue;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;

  return weightedSum / totalWeight;
}

/**
 * Assign a rating band to a composite score.
 *
 * Thresholds per RBIA Policy 2020, Section 8.9.1:
 * - >80%  → VERY_GOOD
 * - >65%  → GOOD      (≤80%)
 * - >50%  → SATISFACTORY (≤65%)
 * - >40%  → MODERATE  (≤50%)
 * - ≤40%  → POOR
 *
 * Boundary values: 0.80 is GOOD (not VERY_GOOD), 0.65 is SATISFACTORY, etc.
 * All thresholds use strict greater-than (>).
 *
 * @param compositeScore - Score in range [0.0, 1.0]
 * @returns Rating band string
 */
export function getRatingBand(compositeScore: number): RatingBand {
  if (compositeScore > 0.8) return "VERY_GOOD";
  if (compositeScore > 0.65) return "GOOD";
  if (compositeScore > 0.5) return "SATISFACTORY";
  if (compositeScore > 0.4) return "MODERATE";
  return "POOR";
}

/**
 * Convert a decimal score (0.0–1.0) to an integer percentage (0–100).
 *
 * Uses Math.round (not floor) per spec — avoids under-counting at boundaries.
 * Example: 14 equally-weighted FULLY_COMPLIANT items → 100%, not 99%.
 *
 * @param score - Decimal score in range [0.0, 1.0]
 * @returns Integer percentage
 */
export function toPercentage(score: number): number {
  return Math.round(score * 100);
}
