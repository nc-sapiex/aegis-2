/**
 * Group an already-linked examination forest into one tree per AuditModule.
 *
 * Freeze historically treated every depth-1 node as a composite input. The
 * core pack has no module-root node: CASH/ATM/… statements are themselves
 * `depth: 1` leaves, so each statement became a fake module and housing's
 * nested root was drowned in the average (spec §6.5: module → composite).
 *
 * Pure: nodes in, roots out. Parent links must already be on `children`.
 */
import type { ScoredNode } from "./rbia-scoring-engine";

export type ForestNode = ScoredNode & {
  moduleId: string | null;
  name?: string;
};

export type CompositeModuleInput = {
  id: string;
  code: string;
  name: string;
  /** Bank-editable 1–100; this is the composite weight, not intra-module roll-up. */
  weight: number;
};

export type CompositeModuleRoot = ScoredNode & {
  compositeWeight: number;
  moduleCode: string;
  name?: string;
};

function byCode(a: ScoredNode, b: ScoredNode): number {
  return a.code.localeCompare(b.code);
}

/**
 * One scored tree per selected module. A module whose statements sit at
 * depth 1 with no matching module-root node is wrapped in a synthetic parent
 * so `computeModuleScore` rolls the leaves up once, then the composite
 * weights that result by `AuditModule.weight`.
 */
export function rootsForComposite(
  nodes: Iterable<ForestNode>,
  modules: CompositeModuleInput[],
): CompositeModuleRoot[] {
  const nodesByModule = new Map<string, ForestNode[]>();
  for (const node of nodes) {
    if (!node.moduleId) continue;
    const list = nodesByModule.get(node.moduleId);
    if (list) list.push(node);
    else nodesByModule.set(node.moduleId, [node]);
  }

  const roots: CompositeModuleRoot[] = [];
  const sortedModules = [...modules].sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  for (const mod of sortedModules) {
    const moduleNodes = nodesByModule.get(mod.id);
    if (!moduleNodes || moduleNodes.length === 0) continue;

    const childIds = new Set<string>();
    for (const n of moduleNodes) {
      for (const child of n.children) childIds.add(child.nodeId);
    }
    const forest = moduleNodes
      .filter((n) => !childIds.has(n.nodeId))
      .sort(byCode);

    const tree: ForestNode =
      forest.length === 1 && forest[0].code === mod.code
        ? forest[0]
        : {
            nodeId: `module:${mod.id}`,
            code: mod.code,
            name: mod.name,
            weight: 1,
            isCritical: false,
            isLeaf: false,
            scoreLabel: null,
            children: forest,
            moduleId: mod.id,
          };

    roots.push({
      ...tree,
      compositeWeight: mod.weight,
      moduleCode: mod.code,
    });
  }

  return roots;
}
