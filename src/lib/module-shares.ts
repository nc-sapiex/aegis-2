export type WeightedModule = {
  code: string;
  weight: number;
  isActive: boolean;
};
export type SharedModule = WeightedModule & { share: number };

/**
 * Share is weight over the sum of weights of ACTIVE modules only (spec
 * §7.6: "Share is weight ÷ the sum of weights of modules that apply to a
 * branch. No weight total is shown."). An inactive module always has share 0
 * and never contributes to the denominator.
 */
export function computeModuleShares(modules: WeightedModule[]): SharedModule[] {
  const activeWeightSum = modules
    .filter((m) => m.isActive)
    .reduce((sum, m) => sum + m.weight, 0);
  return modules.map((m) => ({
    ...m,
    share: m.isActive && activeWeightSum > 0 ? m.weight / activeWeightSum : 0,
  }));
}

/**
 * Recomputes a branch's overall composite score before and after a proposed
 * weight change, using the most recent engagement's per-module scores (spec
 * §7.6's live preview). A module with no prior score is simply omitted from
 * both sums — it has nothing to contribute either way, not a zero score.
 */
export function simulateWeightChange(
  current: WeightedModule[],
  changedCode: string,
  newWeight: number,
  lastModuleScores: Record<string, number>,
): { from: number; to: number } {
  const proposed = current.map((m) =>
    m.code === changedCode ? { ...m, weight: newWeight } : m,
  );

  const compositeOf = (modules: WeightedModule[]): number => {
    const scored = modules.filter(
      (m) => m.isActive && lastModuleScores[m.code] !== undefined,
    );
    const weightSum = scored.reduce((sum, m) => sum + m.weight, 0);
    if (weightSum === 0) return 0;
    return scored.reduce(
      (sum, m) => sum + (m.weight / weightSum) * lastModuleScores[m.code],
      0,
    );
  };

  return { from: compositeOf(current), to: compositeOf(proposed) };
}
