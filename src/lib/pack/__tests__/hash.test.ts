import { describe, expect, it } from "vitest";
import { computeContentHash } from "../hash";

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
