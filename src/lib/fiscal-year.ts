/**
 * Indian Fiscal Year Utilities (April 1 - March 31)
 *
 * Indian FY convention: FY 2025-26 starts Apr 1 2025, ends Mar 31 2026.
 * "FY year" refers to the start year (2025 for FY 2025-26).
 */

export type Quarter = "Q1_APR_JUN" | "Q2_JUL_SEP" | "Q3_OCT_DEC" | "Q4_JAN_MAR";

/**
 * Get current Indian fiscal year.
 * Feb 2026 → { year: 2025, label: "2025-26" }
 */
export function getCurrentFiscalYear(): { year: number; label: string } {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed: 0=Jan, 3=Apr
  const calYear = now.getFullYear();
  const fyYear = month < 3 ? calYear - 1 : calYear;
  return { year: fyYear, label: `${fyYear}-${String(fyYear + 1).slice(2)}` };
}

/**
 * Get current fiscal quarter.
 * Feb 2026 → Q4_JAN_MAR
 */
export function getCurrentQuarter(): Quarter {
  const month = new Date().getMonth(); // 0-indexed
  if (month >= 3 && month <= 5) return "Q1_APR_JUN";
  if (month >= 6 && month <= 8) return "Q2_JUL_SEP";
  if (month >= 9 && month <= 11) return "Q3_OCT_DEC";
  return "Q4_JAN_MAR"; // 0, 1, 2
}

/**
 * Get date range for a fiscal year.
 * 2025 → { start: Apr 1 2025, end: Mar 31 2026 23:59:59 }
 */
export function getFiscalYearDateRange(startYear: number): {
  start: Date;
  end: Date;
} {
  return {
    start: new Date(startYear, 3, 1), // Apr 1
    end: new Date(startYear + 1, 2, 31, 23, 59, 59, 999), // Mar 31
  };
}

/**
 * Get display label for a quarter.
 * Q4_JAN_MAR → "Q4 (Jan-Mar)"
 */
export function getQuarterLabel(quarter: Quarter): string {
  const labels: Record<Quarter, string> = {
    Q1_APR_JUN: "Q1 (Apr-Jun)",
    Q2_JUL_SEP: "Q2 (Jul-Sep)",
    Q3_OCT_DEC: "Q3 (Oct-Dec)",
    Q4_JAN_MAR: "Q4 (Jan-Mar)",
  };
  return labels[quarter];
}

/**
 * Get date range for a specific quarter within a fiscal year.
 * (2025, Q1_APR_JUN) → { start: Apr 1 2025, end: Jun 30 2025 }
 */
export function getQuarterDateRange(
  fyYear: number,
  quarter: Quarter,
): { start: Date; end: Date } {
  switch (quarter) {
    case "Q1_APR_JUN":
      return {
        start: new Date(fyYear, 3, 1),
        end: new Date(fyYear, 5, 30, 23, 59, 59, 999),
      };
    case "Q2_JUL_SEP":
      return {
        start: new Date(fyYear, 6, 1),
        end: new Date(fyYear, 8, 30, 23, 59, 59, 999),
      };
    case "Q3_OCT_DEC":
      return {
        start: new Date(fyYear, 9, 1),
        end: new Date(fyYear, 11, 31, 23, 59, 59, 999),
      };
    case "Q4_JAN_MAR":
      return {
        start: new Date(fyYear + 1, 0, 1),
        end: new Date(fyYear + 1, 2, 31, 23, 59, 59, 999),
      };
  }
}

/** All quarters in fiscal year order */
export const ALL_QUARTERS: Quarter[] = [
  "Q1_APR_JUN",
  "Q2_JUL_SEP",
  "Q3_OCT_DEC",
  "Q4_JAN_MAR",
];
