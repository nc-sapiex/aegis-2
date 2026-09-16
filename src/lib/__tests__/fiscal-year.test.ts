import { describe, it, expect } from "vitest";
import { getFiscalYearWindow } from "../fiscal-year";
import { CreateRamAssessmentSchema } from "@/actions/ram/schemas";

describe("getFiscalYearWindow", () => {
  it("returns YYYY-YY labels centered on the given year by default", () => {
    expect(getFiscalYearWindow(2025)).toEqual([
      "2024-25",
      "2025-26",
      "2026-27",
    ]);
  });

  it("respects custom before/after bounds", () => {
    expect(getFiscalYearWindow(2025, 0, 2)).toEqual([
      "2025-26",
      "2026-27",
      "2027-28",
    ]);
  });

  it("produces labels that satisfy the RAM assessment-year schema", () => {
    for (const label of getFiscalYearWindow(2025)) {
      expect(
        CreateRamAssessmentSchema.shape.assessmentYear.safeParse(label).success,
      ).toBe(true);
    }
  });

  it("rolls the century over correctly", () => {
    expect(getFiscalYearWindow(2099, 0, 1)).toEqual(["2099-00", "2100-01"]);
  });
});
