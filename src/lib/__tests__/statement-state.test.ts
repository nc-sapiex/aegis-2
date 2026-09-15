import { describe, expect, it } from "vitest";
import { deriveStatementState, type ResponseInput } from "../statement-state";

function response(overrides: Partial<ResponseInput>): ResponseInput {
  return {
    scoreLabel: null,
    remarks: null,
    isNotApplicable: false,
    saveFailed: false,
    ...overrides,
  };
}

describe("deriveStatementState", () => {
  it("no score, no N/A: unscored", () => {
    expect(deriveStatementState(response({}))).toBe("unscored");
  });

  it("N/A: not_applicable regardless of score", () => {
    expect(deriveStatementState(response({ isNotApplicable: true }))).toBe(
      "not_applicable",
    );
  });

  it("FULLY_COMPLIANT with no remarks: scored (remarks optional at/above Largely)", () => {
    expect(
      deriveStatementState(response({ scoreLabel: "FULLY_COMPLIANT" })),
    ).toBe("scored");
  });

  it("PARTIALLY_COMPLIANT with no remarks: remarks_due, not scored", () => {
    expect(
      deriveStatementState(response({ scoreLabel: "PARTIALLY_COMPLIANT" })),
    ).toBe("remarks_due");
  });

  it("PARTIALLY_COMPLIANT with remarks: scored", () => {
    expect(
      deriveStatementState(
        response({
          scoreLabel: "PARTIALLY_COMPLIANT",
          remarks: "Missing signature",
        }),
      ),
    ).toBe("scored");
  });

  it("NON_COMPLIANT with remarks: non_compliant, a distinct state from plain scored", () => {
    expect(
      deriveStatementState(
        response({
          scoreLabel: "NON_COMPLIANT",
          remarks: "No collateral on file",
        }),
      ),
    ).toBe("non_compliant");
  });

  it("a failed save always reads not_saved, even with a valid score+remarks", () => {
    expect(
      deriveStatementState(
        response({ scoreLabel: "FULLY_COMPLIANT", saveFailed: true }),
      ),
    ).toBe("not_saved");
  });
});
