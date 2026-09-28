import { describe, expect, it } from "vitest";
import { computeContentHash, packContentsMatchManifest } from "../hash";
import type { PackFiles } from "../types";

describe("computeContentHash", () => {
  it("is deterministic for the same content", () => {
    const files = {
      modules: [{ code: "CRD" }],
      nodes: [],
      questions: [],
      populationSchemas: [],
    };
    expect(computeContentHash(files as never)).toBe(
      computeContentHash(files as never),
    );
  });

  it("changes when content changes", () => {
    const a = computeContentHash({
      modules: [{ code: "CRD" }],
      nodes: [],
      questions: [],
      populationSchemas: [],
    } as never);
    const b = computeContentHash({
      modules: [{ code: "DEP" }],
      nodes: [],
      questions: [],
      populationSchemas: [],
    } as never);
    expect(a).not.toBe(b);
  });

  it("is independent of object key order", () => {
    const a = computeContentHash({
      modules: [{ code: "CRD", name: "x" }],
      nodes: [],
      questions: [],
      populationSchemas: [],
    } as never);
    const b = computeContentHash({
      modules: [{ name: "x", code: "CRD" }],
      nodes: [],
      questions: [],
      populationSchemas: [],
    } as never);
    expect(a).toBe(b);
  });

  it("produces a 64-character hex string", () => {
    const hash = computeContentHash({
      modules: [],
      nodes: [],
      questions: [],
      populationSchemas: [],
    } as never);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

function packWith(
  overrides: Partial<Omit<PackFiles, "manifest">> = {},
): Omit<PackFiles, "manifest"> {
  return {
    modules: [{ code: "CRD", name: "Credit" }],
    nodes: [
      {
        code: "CRD-01",
        moduleCode: "CRD",
        name: "Documentation",
        path: "CRD/CRD-01",
        depth: 1,
        isLeaf: true,
        weight: 1,
        isCritical: true,
        description: "Loan file is complete",
      },
    ],
    questions: [],
    populationSchemas: [],
    ...overrides,
  } as Omit<PackFiles, "manifest">;
}

function filesFor(
  payload: Omit<PackFiles, "manifest">,
  contentHash = computeContentHash(payload),
): PackFiles {
  return {
    manifest: {
      id: "core",
      version: "1.0.0",
      name: "x",
      publisher: "x",
      requiresFramework: "^2.0.0",
      dependsOn: [],
      provides: ["CRD"],
      contentHash,
      signature: "sig",
    },
    ...payload,
  };
}

describe("packContentsMatchManifest", () => {
  it("accepts files whose hash matches the signed manifest", () => {
    expect(packContentsMatchManifest(filesFor(packWith()))).toBe(true);
  });

  it("rejects a tampered nodes.json that keeps the original signed hash", () => {
    const original = packWith();
    const tampered = packWith({
      nodes: original.nodes.map((n) => ({
        ...n,
        description: "attacker-controlled statement",
        isCritical: false,
      })),
    });
    expect(
      packContentsMatchManifest(
        filesFor(tampered, computeContentHash(original)),
      ),
    ).toBe(false);
  });
});
