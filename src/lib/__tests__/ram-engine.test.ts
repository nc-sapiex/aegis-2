import { describe, it, expect } from "vitest";
import {
  areAllActiveParametersScored,
  computeCompositeScore,
  computeRam,
  type RamScoreInput,
} from "@/lib/ram-engine";

const P1 = "param-business";
const P2 = "param-control";

describe("areAllActiveParametersScored", () => {
  it("is false when no active parameters exist", () => {
    expect(areAllActiveParametersScored([], [P1])).toBe(false);
  });

  it("is false when only a subset of active parameters is scored", () => {
    expect(areAllActiveParametersScored([P1, P2], [P1])).toBe(false);
  });

  it("is true when every active parameter has a score", () => {
    expect(areAllActiveParametersScored([P1, P2], [P2, P1])).toBe(true);
  });

  it("ignores extra scores for deactivated parameters", () => {
    expect(areAllActiveParametersScored([P1], [P1, P2])).toBe(true);
  });
});

describe("computeCompositeScore", () => {
  it("normalizes a single low-weight score to a full 1.00 composite", () => {
    // This is why compute must refuse a partial set: one COMPLIANT-looking
    // control tick becomes official LOW risk if it is the only input.
    const scores: RamScoreInput[] = [
      { paramCode: "CR-01", score: 1, weight: 0.05 },
    ];
    expect(computeCompositeScore(scores)).toBe(1);
  });

  it("weights a complete set so a single low score cannot dominate", () => {
    const scores: RamScoreInput[] = [
      { paramCode: "CR-01", score: 1, weight: 0.05 },
      { paramCode: "BR-01", score: 5, weight: 0.95 },
    ];
    expect(computeCompositeScore(scores)).toBe(4.8);
  });
});

describe("computeRam", () => {
  it("maps a 1.00 composite to LOW risk and a 24-month frequency", () => {
    const result = computeRam([{ paramCode: "CR-01", score: 1, weight: 1 }]);
    expect(result).toEqual({
      compositeScore: 1,
      riskCategory: "LOW",
      auditFrequency: 24,
    });
  });
});
