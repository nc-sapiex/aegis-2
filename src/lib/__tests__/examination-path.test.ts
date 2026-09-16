import { describe, it, expect } from "vitest";
import {
  descendantPathPrefix,
  isDescendantPath,
  parentPath,
} from "@/lib/examination-path";

describe("descendantPathPrefix", () => {
  it("appends a slash so startsWith matches children, not a dotted sibling", () => {
    expect(descendantPathPrefix("ROOT/CREDIT")).toBe("ROOT/CREDIT/");
    expect(descendantPathPrefix("OPS")).toBe("OPS/");
  });

  it("does not double the trailing slash", () => {
    expect(descendantPathPrefix("ROOT/CREDIT/")).toBe("ROOT/CREDIT/");
  });
});

describe("isDescendantPath", () => {
  it("matches slash-separated children used by the housing seed and freeze fixtures", () => {
    expect(isDescendantPath("ROOT/CREDIT/CREDIT-001", "ROOT/CREDIT")).toBe(
      true,
    );
    expect(isDescendantPath("OPS/OPS-KYC/OPS-KYC-001", "OPS")).toBe(true);
  });

  it("does not match a sibling that shares a dotted prefix", () => {
    expect(isDescendantPath("ROOT/CREDIT-EXTRA", "ROOT/CREDIT")).toBe(false);
  });

  it("does not treat a dot-joined string as a child (the old lookup)", () => {
    expect(isDescendantPath("ROOT/CREDIT/CREDIT-001", "ROOT/CREDIT.")).toBe(
      false,
    );
  });
});

describe("parentPath", () => {
  it("strips the last segment of a housing-pack path", () => {
    expect(parentPath("CRD-HLN/CRD-HLN-PRE/CRD-HLN-PRE-001")).toBe(
      "CRD-HLN/CRD-HLN-PRE",
    );
    expect(parentPath("CRD-HLN/CRD-HLN-PRE")).toBe("CRD-HLN");
  });

  it("returns null for a module root with no slash", () => {
    expect(parentPath("CRD-HLN")).toBeNull();
  });
});
