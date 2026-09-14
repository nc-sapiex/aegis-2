import { describe, expect, it } from "vitest";
import { formatAmount } from "../format-amount";

describe("formatAmount", () => {
  it("groups in the Indian style: last 3 digits, then pairs", () => {
    expect(formatAmount(1234567)).toBe("₹12,34,567.00");
    expect(formatAmount(999)).toBe("₹999.00");
    expect(formatAmount(1000)).toBe("₹1,000.00");
    expect(formatAmount(100000)).toBe("₹1,00,000.00");
  });

  it("accepts a Decimal-shaped string", () => {
    expect(formatAmount("1234567.5")).toBe("₹12,34,567.50");
  });
});
