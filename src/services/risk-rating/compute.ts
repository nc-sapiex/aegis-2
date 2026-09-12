import type {
  RiskRatingConfig,
  RatingBand,
  ObservationInput,
  RiskRatingResult,
} from "./types";
import { DEFAULT_RISK_RATING_CONFIG } from "./types";
import type { Severity } from "@/generated/prisma/enums";

export class RiskRatingService {
  private config: RiskRatingConfig;

  constructor(config?: Partial<RiskRatingConfig>) {
    this.config = { ...DEFAULT_RISK_RATING_CONFIG, ...config };
  }

  /**
   * Compute risk rating for an engagement based on its observations.
   *
   * Algorithm (R31):
   * 1. Each observation gets a weighted score = severity_weight × repeat_multiplier
   * 2. Total score = sum of all weighted scores
   * 3. Max possible score = count × CRITICAL_weight × repeat_multiplier
   * 4. Percentage = (max_possible - total) / max_possible × 100
   * 5. Map percentage to rating band per R32
   *
   * Inverted scale: fewer/lower findings = higher percentage = better rating
   */
  computeEngagementRating(observations: ObservationInput[]): RiskRatingResult {
    if (observations.length === 0) {
      return {
        totalScore: 0,
        maxPossibleScore: 0,
        percentageScore: 100, // No findings = perfect score
        ratingBand: "VERY_GOOD",
        observationCount: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        repeatFindingCount: 0,
      };
    }

    let totalScore = 0;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let repeatFindingCount = 0;

    for (const obs of observations) {
      const baseWeight = this.config.severityWeights[obs.severity];
      const multiplier = obs.isRepeatFinding
        ? this.config.repeatFindingMultiplier
        : 1;
      const weightedScore = baseWeight * multiplier;

      totalScore += weightedScore;

      // Count by severity
      if (obs.severity === "CRITICAL") criticalCount++;
      else if (obs.severity === "HIGH") highCount++;
      else if (obs.severity === "MEDIUM") mediumCount++;
      else if (obs.severity === "LOW") lowCount++;

      if (obs.isRepeatFinding) repeatFindingCount++;
    }

    // Max possible = all findings at CRITICAL severity with repeat multiplier
    const maxPossibleScore =
      observations.length *
      this.config.severityWeights.CRITICAL *
      this.config.repeatFindingMultiplier;

    // Inverted percentage: (max - actual) / max × 100
    const percentageScore =
      maxPossibleScore > 0
        ? ((maxPossibleScore - totalScore) / maxPossibleScore) * 100
        : 100;

    const ratingBand = this.getRatingBand(percentageScore);

    return {
      totalScore,
      maxPossibleScore,
      percentageScore: Math.round(percentageScore * 100) / 100, // 2 decimal places
      ratingBand,
      observationCount: observations.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      repeatFindingCount,
    };
  }

  /**
   * Map percentage score to rating band per R32.
   */
  getRatingBand(percentageScore: number): RatingBand {
    for (const band of this.config.ratingBands) {
      if (
        percentageScore >= band.minScore &&
        percentageScore <= band.maxScore
      ) {
        return band.band;
      }
    }
    // Fallback
    return "POOR";
  }

  /**
   * Compute aggregate rating for multiple engagements (e.g., quarterly).
   */
  computeAggregateRating(
    engagementRatings: RiskRatingResult[],
  ): RiskRatingResult {
    if (engagementRatings.length === 0) {
      return {
        totalScore: 0,
        maxPossibleScore: 0,
        percentageScore: 100,
        ratingBand: "VERY_GOOD",
        observationCount: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        repeatFindingCount: 0,
      };
    }

    const aggregated = engagementRatings.reduce(
      (acc, rating) => ({
        totalScore: acc.totalScore + rating.totalScore,
        maxPossibleScore: acc.maxPossibleScore + rating.maxPossibleScore,
        observationCount: acc.observationCount + rating.observationCount,
        criticalCount: acc.criticalCount + rating.criticalCount,
        highCount: acc.highCount + rating.highCount,
        mediumCount: acc.mediumCount + rating.mediumCount,
        lowCount: acc.lowCount + rating.lowCount,
        repeatFindingCount: acc.repeatFindingCount + rating.repeatFindingCount,
      }),
      {
        totalScore: 0,
        maxPossibleScore: 0,
        observationCount: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        repeatFindingCount: 0,
      },
    );

    const percentageScore =
      aggregated.maxPossibleScore > 0
        ? ((aggregated.maxPossibleScore - aggregated.totalScore) /
            aggregated.maxPossibleScore) *
          100
        : 100;

    return {
      ...aggregated,
      percentageScore: Math.round(percentageScore * 100) / 100,
      ratingBand: this.getRatingBand(percentageScore),
    };
  }
}
