import { describe, it, expect } from "vitest";
import {
  checkObservationTransition,
  checkReportTransition,
} from "@/lib/maker-checker";

const MAKER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHECKER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("checkObservationTransition", () => {
  it("blocks the raiser from reviewing their own observation", () => {
    const result = checkObservationTransition("SUBMITTED", "REVIEWED", MAKER, {
      createdById: MAKER,
    });
    expect(result).toEqual({
      allowed: false,
      reason:
        "You raised this record; a different user must perform this step.",
    });
  });

  it("blocks the raiser from issuing their own observation", () => {
    expect(
      checkObservationTransition("REVIEWED", "ISSUED", MAKER, {
        createdById: MAKER,
      }).allowed,
    ).toBe(false);
  });

  it("blocks the raiser from closing their own observation", () => {
    expect(
      checkObservationTransition("COMPLIANCE", "CLOSED", MAKER, {
        createdById: MAKER,
      }).allowed,
    ).toBe(false);
  });

  it("allows a different user to review", () => {
    expect(
      checkObservationTransition("SUBMITTED", "REVIEWED", CHECKER, {
        createdById: MAKER,
      }),
    ).toEqual({ allowed: true });
  });

  it("allows the raiser to submit their own draft", () => {
    expect(
      checkObservationTransition("DRAFT", "SUBMITTED", MAKER, {
        createdById: MAKER,
      }),
    ).toEqual({ allowed: true });
  });

  it("allows the raiser to mark compliance, which is not an approval", () => {
    expect(
      checkObservationTransition("RESPONSE", "COMPLIANCE", MAKER, {
        createdById: MAKER,
      }),
    ).toEqual({ allowed: true });
  });

  it("allows a return to draft by the reviewer", () => {
    expect(
      checkObservationTransition("SUBMITTED", "DRAFT", CHECKER, {
        createdById: MAKER,
      }),
    ).toEqual({ allowed: true });
  });
});

describe("checkReportTransition", () => {
  it("blocks the reviewer from approving the report they reviewed", () => {
    const result = checkReportTransition("REVIEWED", "APPROVED", MAKER, {
      reportReviewedById: MAKER,
    });
    expect(result).toEqual({
      allowed: false,
      reason:
        "You reviewed this record; a different user must perform this step.",
    });
  });

  it("blocks the reviewer from issuing the report they reviewed", () => {
    expect(
      checkReportTransition("APPROVED", "ISSUED", MAKER, {
        reportReviewedById: MAKER,
      }).allowed,
    ).toBe(false);
  });

  it("allows the approver to also issue, so a single-CAE bank is not stuck", () => {
    expect(
      checkReportTransition("APPROVED", "ISSUED", CHECKER, {
        reportReviewedById: MAKER,
      }),
    ).toEqual({ allowed: true });
  });

  it("allows approval by someone other than the reviewer", () => {
    expect(
      checkReportTransition("REVIEWED", "APPROVED", CHECKER, {
        reportReviewedById: MAKER,
      }),
    ).toEqual({ allowed: true });
  });

  it("imposes nothing when no reviewer is recorded", () => {
    expect(
      checkReportTransition("REVIEWED", "APPROVED", MAKER, {
        reportReviewedById: null,
      }),
    ).toEqual({ allowed: true });
  });

  it("imposes nothing on a rework transition", () => {
    expect(
      checkReportTransition("REVIEWED", "DRAFT", MAKER, {
        reportReviewedById: MAKER,
      }),
    ).toEqual({ allowed: true });
  });
});
