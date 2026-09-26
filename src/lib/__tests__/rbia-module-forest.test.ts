import { describe, it, expect } from "vitest";
import { rootsForComposite, type ForestNode } from "@/lib/rbia-module-forest";
import {
  computeModuleScore,
  computeCompositeScore,
} from "@/lib/rbia-scoring-engine";

function leaf(
  nodeId: string,
  code: string,
  moduleId: string,
  scoreLabel: ForestNode["scoreLabel"] = "FULLY_COMPLIANT",
): ForestNode {
  return {
    nodeId,
    code,
    weight: 1,
    isCritical: false,
    isLeaf: true,
    scoreLabel,
    children: [],
    moduleId,
  };
}

function group(
  nodeId: string,
  code: string,
  moduleId: string,
  children: ForestNode[],
  weight = 1,
): ForestNode {
  return {
    nodeId,
    code,
    weight,
    isCritical: false,
    isLeaf: false,
    children,
    moduleId,
  };
}

/** Freeze's nodeMap contains every node, not just forest roots. */
function flatten(nodes: ForestNode[]): ForestNode[] {
  const out: ForestNode[] = [];
  const walk = (node: ForestNode) => {
    out.push(node);
    for (const child of node.children) walk(child as ForestNode);
  };
  for (const node of nodes) walk(node);
  return out;
}

describe("rootsForComposite", () => {
  it("keeps a nested module whose depth-1 root code matches AuditModule.code", () => {
    const ops = group("ops", "OPS", "m-ops", [
      leaf("a", "OPS-001", "m-ops"),
      leaf("b", "OPS-002", "m-ops"),
    ]);
    const roots = rootsForComposite(flatten([ops]), [
      { id: "m-ops", code: "OPS", name: "Operations", weight: 1 },
    ]);
    expect(roots).toHaveLength(1);
    expect(roots[0].nodeId).toBe("ops");
    expect(roots[0].moduleCode).toBe("OPS");
    expect(roots[0].children).toHaveLength(2);
  });

  it("wraps core-pack depth-1 leaves so they score as one module, not N composites", () => {
    const cashLeaves = [
      leaf("c1", "CASH-1", "m-cash", "NON_COMPLIANT"),
      leaf("c2", "CASH-2", "m-cash", "NON_COMPLIANT"),
      leaf("c3", "CASH-3", "m-cash", "NON_COMPLIANT"),
    ];
    const ops = group("ops", "OPS", "m-ops", [
      leaf("a", "OPS-001", "m-ops"),
      leaf("b", "OPS-002", "m-ops"),
    ]);
    const roots = rootsForComposite(flatten([...cashLeaves, ops]), [
      { id: "m-cash", code: "CASH", name: "Cash", weight: 1 },
      { id: "m-ops", code: "OPS", name: "Operations", weight: 1 },
    ]);

    expect(roots.map((r) => r.moduleCode)).toEqual(["CASH", "OPS"]);
    expect(roots[0].nodeId).toBe("module:m-cash");
    expect(roots[0].children.map((c) => c.code)).toEqual([
      "CASH-1",
      "CASH-2",
      "CASH-3",
    ]);

    const moduleScores = roots.map((r) => ({
      weight: r.compositeWeight,
      score: computeModuleScore(r),
    }));
    // Ungrouped freeze would average 1 + 0 + 0 + 0 → 0.25.
    expect(computeCompositeScore(moduleScores)).toBe(0.5);
  });

  it("weights the composite by AuditModule.weight, not the statement count", () => {
    const cashLeaves = [
      leaf("c1", "CASH-1", "m-cash", "NON_COMPLIANT"),
      leaf("c2", "CASH-2", "m-cash", "NON_COMPLIANT"),
    ];
    const ops = group("ops", "OPS", "m-ops", [leaf("a", "OPS-001", "m-ops")]);
    const roots = rootsForComposite(flatten([...cashLeaves, ops]), [
      { id: "m-cash", code: "CASH", name: "Cash", weight: 1 },
      { id: "m-ops", code: "OPS", name: "Operations", weight: 9 },
    ]);
    const composite = computeCompositeScore(
      roots.map((r) => ({
        weight: r.compositeWeight,
        score: computeModuleScore(r),
      })),
    );
    // 9×1.0 + 1×0.0 = 0.9. Equal statement weights would be 1/3.
    expect(composite).toBeCloseTo(0.9);
  });

  it("skips a selected module that has no in-scope nodes", () => {
    const ops = group("ops", "OPS", "m-ops", [leaf("a", "OPS-001", "m-ops")]);
    const roots = rootsForComposite(flatten([ops]), [
      { id: "m-ops", code: "OPS", name: "Operations", weight: 1 },
      { id: "m-fx", code: "FX", name: "Forex", weight: 1 },
    ]);
    expect(roots.map((r) => r.moduleCode)).toEqual(["OPS"]);
  });
});
