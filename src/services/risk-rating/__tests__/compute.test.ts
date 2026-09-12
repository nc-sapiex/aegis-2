import { describe, it, expect } from "vitest";
import { RiskRatingService } from "@/services/risk-rating/compute";
import {
  DEFAULT_RISK_RATING_CONFIG,
  type ObservationInput,
} from "@/services/risk-rating/types";
import { Severity } from "@/generated/prisma/enums";

function makeObs(
  severity: (typeof Severity)[keyof typeof Severity],
  isRepeatFinding = false,
  id = "obs-1",
): ObservationInput {
  return { id, severity, isRepeatFinding };
}

// ─── Empty observations ─────────────────────────────────────────────────────

describe("empty observations", () => {
  const service = new RiskRatingService();

  it("returns 100% score and VERY_GOOD rating", () => {
    const result = service.computeEngagementRating([]);
    expect(result.percentageScore).toBe(100);
    expect(result.ratingBand).toBe("VERY_GOOD");
  });

  it("returns zero counts", () => {
    const result = service.computeEngagementRating([]);
    expect(result.observationCount).toBe(0);
    expect(result.totalScore).toBe(0);
    expect(result.maxPossibleScore).toBe(0);
    expect(result.criticalCount).toBe(0);
    expect(result.highCount).toBe(0);
    expect(result.mediumCount).toBe(0);
    expect(result.lowCount).toBe(0);
    expect(result.repeatFindingCount).toBe(0);
  });
});

// ─── Single observation per severity ────────────────────────────────────────

describe("single observation scoring", () => {
  const service = new RiskRatingService();
  // max possible for 1 obs = 1 × 4 (CRITICAL) × 1.5 (repeat) = 6

  it("1 LOW observation → high percentage (VERY_GOOD)", () => {
    // score=1, max=6, pct=(6-1)/6*100 = 83.33%
    const result = service.computeEngagementRating([makeObs("LOW")]);
    expect(result.totalScore).toBe(1);
    expect(result.maxPossibleScore).toBe(6);
    expect(result.percentageScore).toBeCloseTo(83.33, 1);
    expect(result.ratingBand).toBe("VERY_GOOD");
  });

  it("1 MEDIUM observation → GOOD band", () => {
    // score=2, max=6, pct=(6-2)/6*100 = 66.67%
    const result = service.computeEngagementRating([makeObs("MEDIUM")]);
    expect(result.totalScore).toBe(2);
    expect(result.percentageScore).toBeCloseTo(66.67, 1);
    expect(result.ratingBand).toBe("GOOD");
  });

  it("1 HIGH observation → SATISFACTORY band", () => {
    // score=3, max=6, pct=(6-3)/6*100 = 50%
    const result = service.computeEngagementRating([makeObs("HIGH")]);
    expect(result.totalScore).toBe(3);
    expect(result.percentageScore).toBe(50);
    expect(result.ratingBand).toBe("SATISFACTORY");
  });

  it("1 CRITICAL observation → POOR band", () => {
    // score=4, max=6, pct=(6-4)/6*100 = 33.33%
    const result = service.computeEngagementRating([makeObs("CRITICAL")]);
    expect(result.totalScore).toBe(4);
    expect(result.percentageScore).toBeCloseTo(33.33, 1);
    expect(result.ratingBand).toBe("POOR");
  });
});

// ─── Multiple observations ──────────────────────────────────────────────────

describe("multiple observations", () => {
  const service = new RiskRatingService();

  it("2 LOW observations → correct aggregation", () => {
    // score=2, max=12, pct=(12-2)/12*100 = 83.33%
    const result = service.computeEngagementRating([
      makeObs("LOW", false, "obs-1"),
      makeObs("LOW", false, "obs-2"),
    ]);
    expect(result.totalScore).toBe(2);
    expect(result.maxPossibleScore).toBe(12);
    expect(result.observationCount).toBe(2);
    expect(result.lowCount).toBe(2);
    expect(result.ratingBand).toBe("VERY_GOOD");
  });

  it("mixed severities → correct total and counts", () => {
    // LOW(1) + MEDIUM(2) + HIGH(3) + CRITICAL(4) = 10
    // max = 4 × 6 = 24, pct = (24-10)/24*100 = 58.33%
    const result = service.computeEngagementRating([
      makeObs("LOW", false, "obs-1"),
      makeObs("MEDIUM", false, "obs-2"),
      makeObs("HIGH", false, "obs-3"),
      makeObs("CRITICAL", false, "obs-4"),
    ]);
    expect(result.totalScore).toBe(10);
    expect(result.maxPossibleScore).toBe(24);
    expect(result.percentageScore).toBeCloseTo(58.33, 1);
    expect(result.ratingBand).toBe("SATISFACTORY");
    expect(result.lowCount).toBe(1);
    expect(result.mediumCount).toBe(1);
    expect(result.highCount).toBe(1);
    expect(result.criticalCount).toBe(1);
  });

  it("all CRITICAL observations → low percentage", () => {
    // 3 CRITICAL: score=12, max=18, pct=(18-12)/18*100 = 33.33%
    const result = service.computeEngagementRating([
      makeObs("CRITICAL", false, "obs-1"),
      makeObs("CRITICAL", false, "obs-2"),
      makeObs("CRITICAL", false, "obs-3"),
    ]);
    expect(result.percentageScore).toBeCloseTo(33.33, 1);
    expect(result.ratingBand).toBe("POOR");
    expect(result.criticalCount).toBe(3);
  });
});

// ─── Repeat findings ────────────────────────────────────────────────────────

describe("repeat findings", () => {
  const service = new RiskRatingService();

  it("repeat LOW applies 1.5x multiplier", () => {
    // score=1*1.5=1.5, max=6, pct=(6-1.5)/6*100 = 75%
    const result = service.computeEngagementRating([makeObs("LOW", true)]);
    expect(result.totalScore).toBe(1.5);
    expect(result.percentageScore).toBe(75);
    expect(result.ratingBand).toBe("GOOD");
    expect(result.repeatFindingCount).toBe(1);
  });

  it("repeat CRITICAL applies 1.5x multiplier", () => {
    // score=4*1.5=6, max=6, pct=(6-6)/6*100 = 0%
    const result = service.computeEngagementRating([makeObs("CRITICAL", true)]);
    expect(result.totalScore).toBe(6);
    expect(result.percentageScore).toBe(0);
    expect(result.ratingBand).toBe("POOR");
  });

  it("mix of repeat and non-repeat findings", () => {
    // LOW(1) + repeat MEDIUM(2*1.5=3) = 4
    // max = 2*6 = 12, pct = (12-4)/12*100 = 66.67%
    const result = service.computeEngagementRating([
      makeObs("LOW", false, "obs-1"),
      makeObs("MEDIUM", true, "obs-2"),
    ]);
    expect(result.totalScore).toBe(4);
    expect(result.percentageScore).toBeCloseTo(66.67, 1);
    expect(result.repeatFindingCount).toBe(1);
  });
});

// ─── Rating band boundaries ────────────────────────────────────────────────

describe("rating band boundaries", () => {
  const service = new RiskRatingService();

  it("getRatingBand: exactly 80 → VERY_GOOD", () => {
    expect(service.getRatingBand(80)).toBe("VERY_GOOD");
  });

  it("getRatingBand: exactly 100 → VERY_GOOD", () => {
    expect(service.getRatingBand(100)).toBe("VERY_GOOD");
  });

  it("getRatingBand: 79.99 → GOOD", () => {
    expect(service.getRatingBand(79.99)).toBe("GOOD");
  });

  it("getRatingBand: exactly 65 → GOOD", () => {
    expect(service.getRatingBand(65)).toBe("GOOD");
  });

  it("getRatingBand: 64.99 → SATISFACTORY", () => {
    expect(service.getRatingBand(64.99)).toBe("SATISFACTORY");
  });

  it("getRatingBand: exactly 50 → SATISFACTORY", () => {
    expect(service.getRatingBand(50)).toBe("SATISFACTORY");
  });

  it("getRatingBand: 49.99 → MODERATE", () => {
    expect(service.getRatingBand(49.99)).toBe("MODERATE");
  });

  it("getRatingBand: exactly 40 → MODERATE", () => {
    expect(service.getRatingBand(40)).toBe("MODERATE");
  });

  it("getRatingBand: 39.99 → POOR", () => {
    expect(service.getRatingBand(39.99)).toBe("POOR");
  });

  it("getRatingBand: 0 → POOR", () => {
    expect(service.getRatingBand(0)).toBe("POOR");
  });
});

// ─── Custom config ──────────────────────────────────────────────────────────

describe("custom config", () => {
  it("overrides severity weights", () => {
    const service = new RiskRatingService({
      severityWeights: { CRITICAL: 10, HIGH: 7, MEDIUM: 4, LOW: 1 },
    });
    // 1 MEDIUM: score=4, max=1*10*1.5=15, pct=(15-4)/15*100 = 73.33%
    const result = service.computeEngagementRating([makeObs("MEDIUM")]);
    expect(result.totalScore).toBe(4);
    expect(result.maxPossibleScore).toBe(15);
    expect(result.percentageScore).toBeCloseTo(73.33, 1);
  });

  it("overrides repeat finding multiplier", () => {
    const service = new RiskRatingService({
      repeatFindingMultiplier: 2.0,
    });
    // repeat LOW: score=1*2=2, max=1*4*2=8, pct=(8-2)/8*100 = 75%
    const result = service.computeEngagementRating([makeObs("LOW", true)]);
    expect(result.totalScore).toBe(2);
    expect(result.maxPossibleScore).toBe(8);
    expect(result.percentageScore).toBe(75);
  });
});

// ─── Aggregate rating ───────────────────────────────────────────────────────

describe("computeAggregateRating", () => {
  const service = new RiskRatingService();

  it("empty engagements returns 100% VERY_GOOD", () => {
    const result = service.computeAggregateRating([]);
    expect(result.percentageScore).toBe(100);
    expect(result.ratingBand).toBe("VERY_GOOD");
  });

  it("aggregates multiple engagement results", () => {
    const r1 = service.computeEngagementRating([makeObs("LOW", false, "a")]);
    const r2 = service.computeEngagementRating([
      makeObs("CRITICAL", false, "b"),
    ]);
    const agg = service.computeAggregateRating([r1, r2]);
    // r1: score=1, max=6; r2: score=4, max=6
    // agg: score=5, max=12, pct=(12-5)/12*100 = 58.33%
    expect(agg.totalScore).toBe(5);
    expect(agg.maxPossibleScore).toBe(12);
    expect(agg.percentageScore).toBeCloseTo(58.33, 1);
    expect(agg.observationCount).toBe(2);
    expect(agg.lowCount).toBe(1);
    expect(agg.criticalCount).toBe(1);
  });
});

// ─── Default config values ──────────────────────────────────────────────────

describe("DEFAULT_RISK_RATING_CONFIG", () => {
  it("has correct severity weights", () => {
    expect(DEFAULT_RISK_RATING_CONFIG.severityWeights).toEqual({
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    });
  });

  it("has 1.5 repeat finding multiplier", () => {
    expect(DEFAULT_RISK_RATING_CONFIG.repeatFindingMultiplier).toBe(1.5);
  });

  it("has 5 rating bands", () => {
    expect(DEFAULT_RISK_RATING_CONFIG.ratingBands).toHaveLength(5);
  });
});
