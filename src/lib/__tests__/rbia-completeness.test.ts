import { describe, it, expect } from "vitest";
import { findUnscoredLeaves, type LeafStatus } from "../rbia-completeness";
import type { ScoredNode } from "../rbia-scoring-engine";

function leaf(nodeId: string, code: string): ScoredNode {
  return {
    nodeId,
    code,
    weight: 1,
    isCritical: false,
    isLeaf: true,
    children: [],
  };
}

function group(
  nodeId: string,
  code: string,
  children: ScoredNode[],
): ScoredNode {
  return {
    nodeId,
    code,
    weight: 1,
    isCritical: false,
    isLeaf: false,
    children,
  };
}

function statuses(entries: LeafStatus[]): Map<string, LeafStatus> {
  return new Map(entries.map((e) => [e.nodeId, e]));
}

describe("findUnscoredLeaves", () => {
  const tree = [
    group("m1", "OPS", [leaf("l1", "OPS-001"), leaf("l2", "OPS-002")]),
    group("m2", "CREDIT", [leaf("l3", "CREDIT-001")]),
  ];

  it("returns nothing when every leaf is scored", () => {
    const result = findUnscoredLeaves(
      tree,
      statuses([
        { nodeId: "l1", code: "OPS-001", scored: true, notApplicable: false },
        { nodeId: "l2", code: "OPS-002", scored: true, notApplicable: false },
        {
          nodeId: "l3",
          code: "CREDIT-001",
          scored: true,
          notApplicable: false,
        },
      ]),
    );
    expect(result).toEqual([]);
  });

  it("accepts an explicit not-applicable marker in place of a score", () => {
    const result = findUnscoredLeaves(
      tree,
      statuses([
        { nodeId: "l1", code: "OPS-001", scored: true, notApplicable: false },
        { nodeId: "l2", code: "OPS-002", scored: false, notApplicable: true },
        {
          nodeId: "l3",
          code: "CREDIT-001",
          scored: true,
          notApplicable: false,
        },
      ]),
    );
    expect(result).toEqual([]);
  });

  it("reports leaves with no response at all", () => {
    const result = findUnscoredLeaves(
      tree,
      statuses([
        { nodeId: "l1", code: "OPS-001", scored: true, notApplicable: false },
      ]),
    );
    expect(result).toEqual(["OPS-002", "CREDIT-001"]);
  });

  it("reports a response row that carries neither a score nor an N/A mark", () => {
    const result = findUnscoredLeaves(
      [group("m1", "OPS", [leaf("l1", "OPS-001")])],
      statuses([
        { nodeId: "l1", code: "OPS-001", scored: false, notApplicable: false },
      ]),
    );
    expect(result).toEqual(["OPS-001"]);
  });

  it("ignores non-leaf nodes", () => {
    const result = findUnscoredLeaves(
      [
        group("m1", "OPS", [
          group("s1", "OPS-SUB", [leaf("l1", "OPS-SUB-001")]),
        ]),
      ],
      statuses([
        {
          nodeId: "l1",
          code: "OPS-SUB-001",
          scored: true,
          notApplicable: false,
        },
      ]),
    );
    expect(result).toEqual([]);
  });
});
