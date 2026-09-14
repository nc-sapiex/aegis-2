import { describe, expect, it } from "vitest";
import { lintPack } from "../lint";
import type { PackFiles } from "../types";

function validPack(): PackFiles {
  return {
    manifest: {
      id: "core",
      version: "1.0.0",
      name: "x",
      publisher: "x",
      requiresFramework: "^2.0.0",
      dependsOn: [],
      provides: ["CRD"],
      contentHash: "a".repeat(64),
      signature: "sig",
    },
    modules: [
      {
        code: "CRD",
        name: "Credit",
        domain: "CREDIT",
        kinds: ["CHECKLIST"],
        applicability: {},
        weight: 30,
      },
    ],
    nodes: [
      {
        code: "CRD-01",
        moduleCode: "CRD",
        name: "Docs",
        path: "CRD/CRD-01",
        depth: 1,
        isLeaf: true,
        weight: 1,
        isCritical: false,
        description: "File complete",
      },
    ],
    questions: [],
    populationSchemas: [],
  };
}

describe("lintPack", () => {
  it("passes a well-formed pack", () => {
    expect(lintPack(validPack())).toEqual({ ok: true });
  });

  it("rejects duplicate node codes", () => {
    const pack = validPack();
    pack.nodes.push({ ...pack.nodes[0] });
    const result = lintPack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("rejects a node whose moduleCode isn't in provides", () => {
    const pack = validPack();
    pack.nodes[0].moduleCode = "NOT-DECLARED";
    const result = lintPack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.some((e) => e.includes("NOT-DECLARED"))).toBe(true);
  });

  it("rejects a node whose path doesn't start with its own module's code", () => {
    const pack = validPack();
    pack.nodes[0].path = "WRONG/CRD-01";
    const result = lintPack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.some((e) => e.includes("path"))).toBe(true);
  });

  it("rejects a malformed applicability predicate (non-boolean, non-{contains} value)", () => {
    const pack = validPack();
    pack.modules[0].applicability = { hasForex: "yes" as unknown as boolean };
    const result = lintPack(pack);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.some((e) => e.includes("applicability"))).toBe(true);
  });
});
