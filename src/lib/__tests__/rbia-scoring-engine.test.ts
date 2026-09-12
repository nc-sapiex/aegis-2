import { describe, it, expect } from "vitest";
import {
  computeNodeScore,
  computeModuleScore,
  computeCompositeScore,
  getRatingBand,
  toPercentage,
  SCORE_VALUES,
  CRITICAL_ITEM_CAP,
  type ScoredNode,
} from "@/lib/rbia-scoring-engine";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function leaf(
  id: string,
  scoreLabel: ScoredNode["scoreLabel"],
  weight = 1,
  isCritical = false,
): ScoredNode {
  return {
    nodeId: id,
    code: id,
    weight,
    isCritical,
    isLeaf: true,
    scoreLabel,
    children: [],
  };
}

function parent(id: string, children: ScoredNode[], weight = 1): ScoredNode {
  return {
    nodeId: id,
    code: id,
    weight,
    isCritical: false,
    isLeaf: false,
    scoreLabel: null,
    children,
  };
}

// ─── SCORE_VALUES constant ───────────────────────────────────────────────────

describe("SCORE_VALUES", () => {
  it("FULLY_COMPLIANT = 1.0", () => {
    expect(SCORE_VALUES.FULLY_COMPLIANT).toBe(1.0);
  });

  it("LARGELY_COMPLIANT = 0.75", () => {
    expect(SCORE_VALUES.LARGELY_COMPLIANT).toBe(0.75);
  });

  it("PARTIALLY_COMPLIANT = 0.5", () => {
    expect(SCORE_VALUES.PARTIALLY_COMPLIANT).toBe(0.5);
  });

  it("NON_COMPLIANT = 0.0", () => {
    expect(SCORE_VALUES.NON_COMPLIANT).toBe(0.0);
  });
});

// ─── CRITICAL_ITEM_CAP constant ──────────────────────────────────────────────

describe("CRITICAL_ITEM_CAP", () => {
  it("equals 0.5", () => {
    expect(CRITICAL_ITEM_CAP).toBe(0.5);
  });
});

// ─── computeNodeScore ────────────────────────────────────────────────────────

describe("computeNodeScore", () => {
  it("1. Single leaf FULLY_COMPLIANT returns score 1.0, hasCriticalNonCompliant false", () => {
    const node = leaf("n1", "FULLY_COMPLIANT");
    expect(computeNodeScore(node)).toEqual({
      score: 1.0,
      hasCriticalNonCompliant: false,
    });
  });

  it("2. Single leaf NON_COMPLIANT returns score 0.0, hasCriticalNonCompliant false", () => {
    const node = leaf("n2", "NON_COMPLIANT");
    expect(computeNodeScore(node)).toEqual({
      score: 0.0,
      hasCriticalNonCompliant: false,
    });
  });

  it("3. Single unscored leaf (scoreLabel: null) returns score null", () => {
    const node = leaf("n3", null);
    expect(computeNodeScore(node)).toEqual({
      score: null,
      hasCriticalNonCompliant: false,
    });
  });

  it("4. Critical leaf with NON_COMPLIANT returns hasCriticalNonCompliant true", () => {
    const node = leaf("n4", "NON_COMPLIANT", 1, true);
    expect(computeNodeScore(node)).toEqual({
      score: 0.0,
      hasCriticalNonCompliant: true,
    });
  });

  it("5. Critical leaf with FULLY_COMPLIANT returns hasCriticalNonCompliant false", () => {
    const node = leaf("n5", "FULLY_COMPLIANT", 1, true);
    expect(computeNodeScore(node)).toEqual({
      score: 1.0,
      hasCriticalNonCompliant: false,
    });
  });

  it("6. Parent with 2 equally-weighted children (FULLY + NON_COMPLIANT) returns score 0.5", () => {
    const node = parent("p1", [
      leaf("c1", "FULLY_COMPLIANT"),
      leaf("c2", "NON_COMPLIANT"),
    ]);
    const result = computeNodeScore(node);
    expect(result.score).toBeCloseTo(0.5);
    expect(result.hasCriticalNonCompliant).toBe(false);
  });

  it("7. Parent with weighted children (weight 3 FULLY + weight 1 NON_COMPLIANT) returns score 0.75", () => {
    const node = parent("p2", [
      leaf("c3", "FULLY_COMPLIANT", 3),
      leaf("c4", "NON_COMPLIANT", 1),
    ]);
    const result = computeNodeScore(node);
    expect(result.score).toBeCloseTo(0.75);
  });

  it("8. Parent where all children are unscored returns score null", () => {
    const node = parent("p3", [leaf("c5", null), leaf("c6", null)]);
    expect(computeNodeScore(node)).toEqual({
      score: null,
      hasCriticalNonCompliant: false,
    });
  });

  it("9. Parent with mix of scored and unscored — unscored excluded from denominator", () => {
    const node = parent("p4", [
      leaf("c7", "FULLY_COMPLIANT", 1),
      leaf("c8", null, 1), // N/A — excluded
    ]);
    const result = computeNodeScore(node);
    // Only c7 is scored, so score = 1.0 (denominator is weight of c7 only)
    expect(result.score).toBeCloseTo(1.0);
  });

  it("10. Deep nesting (3 levels) — scores propagate upward correctly", () => {
    // Level 2 (leaves): FULLY=1.0, NON=0.0 → parent avg = 0.5
    const mid = parent("mid", [
      leaf("l1", "FULLY_COMPLIANT"),
      leaf("l2", "NON_COMPLIANT"),
    ]);
    // Level 1: mid (score 0.5, weight 1) + leaf FULLY (score 1.0, weight 1) → avg 0.75
    const top = parent("top", [mid, leaf("l3", "FULLY_COMPLIANT")]);
    const result = computeNodeScore(top);
    expect(result.score).toBeCloseTo(0.75);
  });

  it("11. Critical non-compliant child propagates hasCriticalNonCompliant=true upward", () => {
    const node = parent("p5", [
      leaf("c9", "NON_COMPLIANT", 1, true), // critical NON_COMPLIANT
      leaf("c10", "FULLY_COMPLIANT"),
    ]);
    const result = computeNodeScore(node);
    expect(result.hasCriticalNonCompliant).toBe(true);
  });
});

// ─── computeModuleScore ──────────────────────────────────────────────────────

describe("computeModuleScore", () => {
  it("12. Module without critical items returns raw score (no cap)", () => {
    // raw score = 0.9 — no critical items, so no cap
    const moduleNode = parent("m1", [
      leaf("i1", "FULLY_COMPLIANT", 9),
      leaf("i2", "NON_COMPLIANT", 1),
    ]);
    const score = computeModuleScore(moduleNode);
    expect(score).toBeCloseTo(0.9);
  });

  it("13. Module with critical NON_COMPLIANT and raw score > 0.5 returns 0.5 (capped)", () => {
    // 9 FULLY + 1 critical NON_COMPLIANT → raw = 0.9, but capped at 0.5
    const moduleNode = parent("m2", [
      leaf("i3", "FULLY_COMPLIANT", 9),
      leaf("i4", "NON_COMPLIANT", 1, true), // critical
    ]);
    const score = computeModuleScore(moduleNode);
    expect(score).toBe(0.5);
  });

  it("14. Module with critical NON_COMPLIANT and raw score <= 0.5 returns raw score (cap is ceiling, not floor)", () => {
    // 1 FULLY + 9 critical NON_COMPLIANT → raw = 0.1, cap=0.5 doesn't apply (0.1 < 0.5)
    const moduleNode = parent("m3", [
      leaf("i5", "FULLY_COMPLIANT", 1),
      leaf("i6", "NON_COMPLIANT", 9, true), // critical
    ]);
    const score = computeModuleScore(moduleNode);
    expect(score).toBeCloseTo(0.1);
  });

  it("15. Module where all items are null returns null", () => {
    const moduleNode = parent("m4", [leaf("i7", null), leaf("i8", null)]);
    const score = computeModuleScore(moduleNode);
    expect(score).toBeNull();
  });
});

// ─── computeCompositeScore ───────────────────────────────────────────────────

describe("computeCompositeScore", () => {
  it("16. Two modules with equal weights, scores 0.8 and 0.6, returns 0.7", () => {
    const result = computeCompositeScore([
      { weight: 1, score: 0.8 },
      { weight: 1, score: 0.6 },
    ]);
    expect(result).toBeCloseTo(0.7);
  });

  it("17. Two modules with weights 70 and 30, scores 0.9 and 0.6, returns 0.81", () => {
    const result = computeCompositeScore([
      { weight: 70, score: 0.9 },
      { weight: 30, score: 0.6 },
    ]);
    // (0.9 * 70 + 0.6 * 30) / 100 = (63 + 18) / 100 = 0.81
    expect(result).toBeCloseTo(0.81);
  });

  it("18. One null-score module excluded — denominator only includes scored modules", () => {
    const result = computeCompositeScore([
      { weight: 50, score: 0.8 },
      { weight: 50, score: null }, // excluded
    ]);
    // Only the scored module contributes: 0.8 * 50 / 50 = 0.8
    expect(result).toBeCloseTo(0.8);
  });

  it("19. All null modules returns null", () => {
    const result = computeCompositeScore([
      { weight: 1, score: null },
      { weight: 1, score: null },
    ]);
    expect(result).toBeNull();
  });
});

// ─── getRatingBand ───────────────────────────────────────────────────────────

describe("getRatingBand", () => {
  it("20. Score 0.85 returns VERY_GOOD (>0.80)", () => {
    expect(getRatingBand(0.85)).toBe("VERY_GOOD");
  });

  it("21. Score 0.80 returns GOOD (exactly 0.80, NOT Very Good — threshold is strictly >0.80)", () => {
    expect(getRatingBand(0.8)).toBe("GOOD");
  });

  it("22. Score 0.70 returns GOOD (>0.65)", () => {
    expect(getRatingBand(0.7)).toBe("GOOD");
  });

  it("23. Score 0.65 returns SATISFACTORY (exactly 0.65, NOT Good)", () => {
    expect(getRatingBand(0.65)).toBe("SATISFACTORY");
  });

  it("24. Score 0.55 returns SATISFACTORY (>0.50)", () => {
    expect(getRatingBand(0.55)).toBe("SATISFACTORY");
  });

  it("25. Score 0.50 returns MODERATE (exactly 0.50, NOT Satisfactory)", () => {
    expect(getRatingBand(0.5)).toBe("MODERATE");
  });

  it("26. Score 0.45 returns MODERATE (>0.40)", () => {
    expect(getRatingBand(0.45)).toBe("MODERATE");
  });

  it("27. Score 0.40 returns POOR (exactly 0.40, NOT Moderate)", () => {
    expect(getRatingBand(0.4)).toBe("POOR");
  });

  it("28. Score 0.35 returns POOR", () => {
    expect(getRatingBand(0.35)).toBe("POOR");
  });

  it("29. Score 0.0 returns POOR", () => {
    expect(getRatingBand(0.0)).toBe("POOR");
  });

  it("30. Score 1.0 returns VERY_GOOD", () => {
    expect(getRatingBand(1.0)).toBe("VERY_GOOD");
  });
});

// ─── toPercentage ────────────────────────────────────────────────────────────

describe("toPercentage", () => {
  it("31. 0.7854 returns 79 (Math.round)", () => {
    expect(toPercentage(0.7854)).toBe(79);
  });

  it("32. 0.785 returns 79 (78.5 rounds to 79 via Math.round)", () => {
    expect(toPercentage(0.785)).toBe(79);
  });

  it("33. 1.0 returns 100", () => {
    expect(toPercentage(1.0)).toBe(100);
  });

  it("34. 0.0 returns 0", () => {
    expect(toPercentage(0.0)).toBe(0);
  });
});

// ─── Edge case: Floating-point accumulation ───────────────────────────────────

describe("floating-point edge case", () => {
  it("36. 14 equally-weighted items all FULLY_COMPLIANT → toPercentage(computeModuleScore(...)) equals 100", () => {
    const items = Array.from({ length: 14 }, (_, i) =>
      leaf(`fp${i}`, "FULLY_COMPLIANT", 1),
    );
    const moduleNode = parent("fp-module", items);
    const score = computeModuleScore(moduleNode);
    expect(score).not.toBeNull();
    expect(toPercentage(score!)).toBe(100);
  });
});
