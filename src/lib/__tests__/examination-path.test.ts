import { describe, it, expect } from "vitest";
import { descendantPathPrefix, isDescendantPath } from "@/lib/examination-path";

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
