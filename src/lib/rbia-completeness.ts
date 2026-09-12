/**
 * Freeze completeness for RBIA examinations — pure, no I/O.
 *
 * A composite score computed over a partly-scored tree is not wrong so much as
 * misleading: `computeNodeScore` excludes unscored leaves from the denominator,
 * so one scored item out of two hundred yields a confident-looking number. The
 * freeze is irreversible (the BranchRbiaScore immutability trigger), so the
 * gate belongs before it, not after.
 *
 * "Not applicable" must be recorded deliberately. An absent score cannot mean
 * both "not done yet" and "does not apply to this branch".
 */
import type { ScoredNode } from "./rbia-scoring-engine";

export type LeafStatus = {
  nodeId: string;
  code: string;
  scored: boolean;
  notApplicable: boolean;
};

/**
 * Codes of leaves under `modules` that are neither scored nor marked not
 * applicable, in tree order. Empty means the examination may be frozen.
 */
export function findUnscoredLeaves(
  modules: ScoredNode[],
  statuses: Map<string, LeafStatus>,
): string[] {
  const outstanding: string[] = [];

  function walk(node: ScoredNode): void {
    if (node.isLeaf) {
      const status = statuses.get(node.nodeId);
      if (!status || (!status.scored && !status.notApplicable)) {
        outstanding.push(node.code);
      }
      return;
    }
    for (const child of node.children) walk(child);
  }

  for (const mod of modules) walk(mod);
  return outstanding;
}
