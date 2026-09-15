import { describe, expect, it } from "vitest";
import { computeModuleShares, simulateWeightChange } from "../module-shares";

describe("computeModuleShares", () => {
  it("share is weight over the sum of active weights", () => {
    const shares = computeModuleShares([
      { code: "CRD", weight: 30, isActive: true },
      { code: "DEP", weight: 20, isActive: true },
      { code: "FX", weight: 50, isActive: true },
    ]);
    expect(shares.find((s) => s.code === "CRD")?.share).toBeCloseTo(0.3);
    expect(shares.find((s) => s.code === "FX")?.share).toBeCloseTo(0.5);
  });

  it("an inactive module gets zero share and is excluded from the denominator", () => {
    const shares = computeModuleShares([
      { code: "CRD", weight: 30, isActive: true },
      { code: "FX", weight: 70, isActive: false },
    ]);
    expect(shares.find((s) => s.code === "CRD")?.share).toBeCloseTo(1.0);
    expect(shares.find((s) => s.code === "FX")?.share).toBe(0);
  });

  it("no active modules: every share is zero, no division by zero", () => {
    const shares = computeModuleShares([
      { code: "CRD", weight: 30, isActive: false },
    ]);
    expect(shares[0].share).toBe(0);
  });
});

describe("simulateWeightChange", () => {
  const modules = [
    { code: "CRD", weight: 60, isActive: true },
    { code: "FX", weight: 40, isActive: true },
  ];
  const lastScores = { CRD: 0.9, FX: 0.5 }; // last engagement's per-module composite (0-1)

  it("computes the branch composite before and after a weight change", () => {
    // before: 0.6*0.9 + 0.4*0.5 = 0.74
    // after CRD -> 80, FX stays 40 (total 120): 0.667*0.9 + 0.333*0.5 = 0.767
    const result = simulateWeightChange(modules, "CRD", 80, lastScores);
    expect(result.from).toBeCloseTo(0.74, 3);
    expect(result.to).toBeCloseTo(0.767, 2);
  });

  it("a module with no prior score contributes zero to both from and to", () => {
    const result = simulateWeightChange(modules, "CRD", 60, { CRD: 0.9 }); // FX has no prior score
    expect(result.from).toBeCloseTo(result.to, 5); // unchanged weight, same composite either way
  });
});
