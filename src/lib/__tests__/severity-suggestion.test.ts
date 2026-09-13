import { describe, expect, it } from "vitest";
import { suggestSeverity } from "../severity-suggestion";

describe("suggestSeverity", () => {
  it("Non-compliant suggests High", () => {
    expect(suggestSeverity("NON_COMPLIANT", false)).toBe("HIGH");
  });

  it("Partly suggests Low", () => {
    expect(suggestSeverity("PARTIALLY_COMPLIANT", false)).toBe("LOW");
  });

  it("Largely and Fully suggest nothing", () => {
    expect(suggestSeverity("LARGELY_COMPLIANT", false)).toBeNull();
    expect(suggestSeverity("FULLY_COMPLIANT", false)).toBeNull();
  });

  it("a critical statement bumps one level, capped at the top", () => {
    expect(suggestSeverity("PARTIALLY_COMPLIANT", true)).toBe("MEDIUM");
    expect(suggestSeverity("NON_COMPLIANT", true)).toBe("CRITICAL");
  });
});
