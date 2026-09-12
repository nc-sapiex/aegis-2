import type { Severity } from "@/generated/prisma/enums";

export type RatingBand =
  | "VERY_GOOD"
  | "GOOD"
  | "SATISFACTORY"
  | "MODERATE"
  | "POOR";

export interface RiskRatingConfig {
  repeatFindingMultiplier: number;
  severityWeights: Record<Severity, number>;
  ratingBands: {
    band: RatingBand;
    minScore: number;
    maxScore: number;
  }[];
}

export interface ObservationInput {
  id: string;
  severity: Severity;
  isRepeatFinding: boolean;
}

export interface RiskRatingResult {
  totalScore: number;
  maxPossibleScore: number;
  percentageScore: number;
  ratingBand: RatingBand;
  observationCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  repeatFindingCount: number;
}

// Default configuration per R31, R32
export const DEFAULT_RISK_RATING_CONFIG: RiskRatingConfig = {
  repeatFindingMultiplier: 1.5,
  severityWeights: {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  },
  ratingBands: [
    { band: "VERY_GOOD", minScore: 80, maxScore: 100 },
    { band: "GOOD", minScore: 65, maxScore: 79.99 },
    { band: "SATISFACTORY", minScore: 50, maxScore: 64.99 },
    { band: "MODERATE", minScore: 40, maxScore: 49.99 },
    { band: "POOR", minScore: 0, maxScore: 39.99 },
  ],
};
