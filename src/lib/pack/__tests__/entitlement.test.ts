import { describe, expect, it } from "vitest";
import { checkEntitlement } from "../entitlement";

describe("checkEntitlement", () => {
  it("core is always entitled, with or without a features entry", () => {
    expect(checkEntitlement([], "core", "1.0.0")).toBe(true);
    expect(checkEntitlement(["pack:core@*"], "core", "2.5.0")).toBe(true);
  });

  it("a non-core pack with no matching entry is not entitled", () => {
    expect(checkEntitlement([], "example-forex", "1.0.0")).toBe(false);
    expect(
      checkEntitlement(["some-other-feature"], "example-forex", "1.0.0"),
    ).toBe(false);
  });

  it("a non-core pack with a matching range entry is entitled", () => {
    expect(
      checkEntitlement(["pack:example-forex@^1.0.0"], "example-forex", "1.2.0"),
    ).toBe(true);
    expect(
      checkEntitlement(["pack:example-forex@^1.0.0"], "example-forex", "2.0.0"),
    ).toBe(false);
  });

  it("a wildcard range entitles any version", () => {
    expect(
      checkEntitlement(["pack:example-forex@*"], "example-forex", "9.9.9"),
    ).toBe(true);
  });
});
