import { describe, expect, it } from "vitest";
import { formatScore, formatRatio } from "../format-score";

describe("formatScore", () => {
  it("prints one decimal percentage", () => {
    expect(formatScore(0.714)).toBe("71.4");
    expect(formatScore(1)).toBe("100.0");
    expect(formatScore(0)).toBe("0.0");
  });
});

describe("formatRatio", () => {
  it("prints the ratio for each label", () => {
    expect(formatRatio("FULLY_COMPLIANT")).toBe("1.00");
    expect(formatRatio("LARGELY_COMPLIANT")).toBe("0.75");
    expect(formatRatio("PARTIALLY_COMPLIANT")).toBe("0.50");
    expect(formatRatio("MARGINALLY_COMPLIANT")).toBe("0.25");
    expect(formatRatio("NON_COMPLIANT")).toBe("0.00");
  });

  it("prints an em dash for no score", () => {
    expect(formatRatio(null)).toBe("—");
  });
});
