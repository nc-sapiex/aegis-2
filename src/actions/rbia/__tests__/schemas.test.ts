import { describe, expect, it } from "vitest";
import {
  NOT_APPLICABLE_REASON_MIN,
  SaveExaminationResponseSchema,
} from "../schemas";

/**
 * The scored/not-applicable split is an invariant the database cannot express:
 * `score` and `isNotApplicable` are independent columns, and the freeze
 * completeness gate treats a leaf as done if it has either. These cases pin the
 * one place that keeps them mutually exclusive.
 */

const ENGAGEMENT_ID = "11111111-1111-4111-8111-111111111111";
const NODE_ID = "22222222-2222-4222-8222-222222222222";

/** 20 characters exactly — the shortest reason the schema accepts. */
const VALID_REASON = "Branch has no locker";

const base = {
  engagementId: ENGAGEMENT_ID,
  nodeId: NODE_ID,
};

/** Paths of the issues a failed parse reported, so a case asserts *where*. */
function issuePaths(input: unknown): string[] {
  const result = SaveExaminationResponseSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

describe("SaveExaminationResponseSchema", () => {
  it("accepts a scored response and defaults isNotApplicable to false", () => {
    const result = SaveExaminationResponseSchema.safeParse({
      ...base,
      scoreLabel: "FULLY_COMPLIANT",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isNotApplicable).toBe(false);
      expect(result.data.scoreLabel).toBe("FULLY_COMPLIANT");
    }
  });

  it("accepts a not-applicable response with a reason and no score", () => {
    const result = SaveExaminationResponseSchema.safeParse({
      ...base,
      isNotApplicable: true,
      notApplicableReason: VALID_REASON,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isNotApplicable).toBe(true);
      expect(result.data.scoreLabel).toBeUndefined();
    }
  });

  it("rejects a response that is neither scored nor not applicable", () => {
    expect(issuePaths(base)).toContain("scoreLabel");
  });

  it("rejects a not-applicable response that also carries a score", () => {
    expect(
      issuePaths({
        ...base,
        isNotApplicable: true,
        notApplicableReason: VALID_REASON,
        scoreLabel: "FULLY_COMPLIANT",
      }),
    ).toContain("scoreLabel");
  });

  it("rejects a not-applicable response with no reason", () => {
    expect(issuePaths({ ...base, isNotApplicable: true })).toContain(
      "notApplicableReason",
    );
  });

  it("rejects a reason one character short of the minimum", () => {
    const tooShort = "x".repeat(NOT_APPLICABLE_REASON_MIN - 1);

    expect(
      issuePaths({
        ...base,
        isNotApplicable: true,
        notApplicableReason: tooShort,
      }),
    ).toContain("notApplicableReason");
  });

  it("measures the reason after trimming, so whitespace is not a reason", () => {
    expect(
      issuePaths({
        ...base,
        isNotApplicable: true,
        notApplicableReason: " ".repeat(NOT_APPLICABLE_REASON_MIN + 5),
      }),
    ).toContain("notApplicableReason");
  });

  it("rejects flagging a not-applicable item for an observation", () => {
    expect(
      issuePaths({
        ...base,
        isNotApplicable: true,
        notApplicableReason: VALID_REASON,
        flagForObservation: true,
      }),
    ).toContain("isNotApplicable");
  });

  it("rejects flagging a not-applicable item for an action point", () => {
    expect(
      issuePaths({
        ...base,
        isNotApplicable: true,
        notApplicableReason: VALID_REASON,
        flagForActionPoint: true,
      }),
    ).toContain("isNotApplicable");
  });

  it("still requires 500-character working notes for a partial score", () => {
    expect(
      issuePaths({
        ...base,
        scoreLabel: "PARTIALLY_COMPLIANT",
        workingNotes: "too short",
      }),
    ).toContain("workingNotes");
  });

  it("does not require working notes for a not-applicable item", () => {
    const result = SaveExaminationResponseSchema.safeParse({
      ...base,
      isNotApplicable: true,
      notApplicableReason: VALID_REASON,
    });

    expect(result.success).toBe(true);
  });
});
