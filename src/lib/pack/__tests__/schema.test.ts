import { describe, expect, it } from "vitest";
import { PackManifestSchema, PackNodeFileSchema } from "../schema";

describe("PackManifestSchema", () => {
  it("accepts a well-formed manifest", () => {
    const result = PackManifestSchema.safeParse({
      id: "core",
      version: "1.0.0",
      name: "AEGIS Core",
      publisher: "Nexly",
      requiresFramework: "^2.0.0",
      dependsOn: [],
      provides: ["OPS", "CRD"],
      contentHash: "a".repeat(64),
      signature: "base64signature==",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-semver version", () => {
    const result = PackManifestSchema.safeParse({
      id: "core",
      version: "not-a-version",
      name: "x",
      publisher: "x",
      requiresFramework: "^2.0.0",
      dependsOn: [],
      provides: [],
      contentHash: "a".repeat(64),
      signature: "sig",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a contentHash that isn't 64 hex characters", () => {
    const result = PackManifestSchema.safeParse({
      id: "core",
      version: "1.0.0",
      name: "x",
      publisher: "x",
      requiresFramework: "^2.0.0",
      dependsOn: [],
      provides: [],
      contentHash: "too-short",
      signature: "sig",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty signature (unsigned, freshly-built manifest)", () => {
    const result = PackManifestSchema.safeParse({
      id: "core",
      version: "1.0.0",
      name: "x",
      publisher: "x",
      requiresFramework: "^2.0.0",
      dependsOn: [],
      provides: [],
      contentHash: "a".repeat(64),
      signature: "",
    });
    expect(result.success).toBe(true);
  });
});

describe("PackNodeFileSchema", () => {
  it("accepts a well-formed node list and rejects a weight out of range", () => {
    const good = PackNodeFileSchema.safeParse([
      {
        code: "CRD-01",
        moduleCode: "CRD",
        name: "Documentation",
        path: "CRD/CRD-01",
        depth: 1,
        isLeaf: true,
        weight: 1.5,
        isCritical: false,
        description: "Loan file is complete",
      },
    ]);
    expect(good.success).toBe(true);

    const bad = PackNodeFileSchema.safeParse([
      {
        code: "CRD-01",
        moduleCode: "CRD",
        name: "x",
        path: "CRD/CRD-01",
        depth: 1,
        isLeaf: true,
        weight: 999,
        isCritical: false,
        description: "x",
      },
    ]);
    expect(bad.success).toBe(false);
  });
});
