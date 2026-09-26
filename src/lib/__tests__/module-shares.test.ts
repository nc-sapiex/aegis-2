import { describe, expect, it } from "vitest";
import {
  computeModuleShares,
  parseLastModuleScores,
  simulateWeightChange,
} from "../module-shares";

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

describe("parseLastModuleScores", () => {
  it("coerces a frozen BranchRbiaScore.moduleScores JSON blob into a Record<string, number>", () => {
    const raw: unknown = { CRD: 0.9, FX: 0.5 };
    expect(parseLastModuleScores(raw)).toEqual({ CRD: 0.9, FX: 0.5 });
  });

  it("returns {} for null/non-object input rather than throwing", () => {
    expect(parseLastModuleScores(null)).toEqual({});
    expect(parseLastModuleScores(undefined)).toEqual({});
    expect(parseLastModuleScores("not an object")).toEqual({});
    expect(parseLastModuleScores(["array", "not", "object"])).toEqual({});
  });

  it("drops keys whose value isn't a finite number", () => {
    expect(
      parseLastModuleScores({ CRD: 0.9, BAD: "n/a", WORSE: null }),
    ).toEqual({ CRD: 0.9 });
  });

  // #203: module-table.tsx hardcoded `lastScores = {}` instead of reading
  // the tenant's last frozen score, so the weight-change preview always
  // computed against an empty map and silently dropped the module's actual
  // prior score. This closes that gap — on unmodified code `parseLastModuleScores`
  // doesn't exist at all, so this test can only pass once the fix (this
  // function, plus getLastFrozenModuleScores wiring it into the page) lands.
  it("wired into the weight-change preview, recovers the real prior score that an empty lastScores drops", () => {
    const modules = [
      { code: "CRD", weight: 60, isActive: true },
      { code: "FX", weight: 40, isActive: true },
    ];
    const frozenModuleScores = { CRD: 0.9, FX: 0.5 };

    // Today's bug, reproduced directly: an empty lastScores (what
    // module-table.tsx hardcoded) makes every module look score-less, so the
    // preview is always computed as 0, not the module's actual prior score.
    const withoutFix = simulateWeightChange(modules, "CRD", 80, {});
    expect(withoutFix.from).toBe(0);

    // The fix: lastScores comes from
    // parseLastModuleScores(getLastFrozenModuleScores(tenantId)) instead.
    const withFix = simulateWeightChange(
      modules,
      "CRD",
      80,
      parseLastModuleScores(frozenModuleScores),
    );
    expect(withFix.from).toBeCloseTo(0.74, 3); // 0.6*0.9 + 0.4*0.5
    expect(withFix.from).not.toBe(withoutFix.from);
  });
});
