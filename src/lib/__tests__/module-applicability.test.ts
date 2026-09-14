import { describe, expect, it } from "vitest";
import { evaluateApplicability } from "../module-applicability";

const branch = {
  hasForex: true,
  hasCurrencyChest: false,
  hasGovtBusiness: true,
  hasLockers: true,
  hasAtm: true,
  loanProducts: ["HOUSING", "GOLD"],
};

describe("evaluateApplicability", () => {
  it("empty predicate is always applicable", () => {
    expect(evaluateApplicability({}, branch)).toBe(true);
  });

  it("a boolean-flag predicate matches when the branch has the flag", () => {
    expect(evaluateApplicability({ hasForex: true }, branch)).toBe(true);
    expect(evaluateApplicability({ hasCurrencyChest: true }, branch)).toBe(
      false,
    );
  });

  it("a loanProducts contains-predicate matches when the array includes the value", () => {
    expect(
      evaluateApplicability({ loanProducts: { contains: "GOLD" } }, branch),
    ).toBe(true);
    expect(
      evaluateApplicability({ loanProducts: { contains: "VEHICLE" } }, branch),
    ).toBe(false);
  });

  it("multiple keys are ANDed", () => {
    expect(
      evaluateApplicability({ hasForex: true, hasCurrencyChest: true }, branch),
    ).toBe(false);
  });
});
