import { describe, it, expect } from "vitest";
import {
  computeCompliancePercentage,
  mapComplianceToScoreLabel,
  computeModuleComplianceScores,
  type ResponseTally,
  type QuestionComplianceResult,
} from "@/lib/instance-scoring";

// ─── computeCompliancePercentage ─────────────────────────────────────────────

describe("computeCompliancePercentage", () => {
  it("1. Empty array returns null (Not Examined — zero responses)", () => {
    expect(computeCompliancePercentage([])).toBeNull();
  });

  it("2. Single COMPLIANT response returns 100", () => {
    const responses: ResponseTally[] = [{ status: "COMPLIANT" }];
    expect(computeCompliancePercentage(responses)).toBe(100);
  });

  it("3. Single VIOLATION response returns 0", () => {
    const responses: ResponseTally[] = [{ status: "VIOLATION" }];
    expect(computeCompliancePercentage(responses)).toBe(0);
  });

  it("4. 1 COMPLIANT + 1 VIOLATION returns 50", () => {
    const responses: ResponseTally[] = [
      { status: "COMPLIANT" },
      { status: "VIOLATION" },
    ];
    expect(computeCompliancePercentage(responses)).toBe(50);
  });

  it("5. 2 COMPLIANT + 0 VIOLATION returns 100", () => {
    const responses: ResponseTally[] = [
      { status: "COMPLIANT" },
      { status: "COMPLIANT" },
    ];
    expect(computeCompliancePercentage(responses)).toBe(100);
  });

  it("6. 3 COMPLIANT + 1 VIOLATION returns 75", () => {
    const responses: ResponseTally[] = [
      { status: "COMPLIANT" },
      { status: "COMPLIANT" },
      { status: "COMPLIANT" },
      { status: "VIOLATION" },
    ];
    expect(computeCompliancePercentage(responses)).toBe(75);
  });

  it("7. 2 COMPLIANT + 2 VIOLATION returns 50", () => {
    const responses: ResponseTally[] = [
      { status: "COMPLIANT" },
      { status: "COMPLIANT" },
      { status: "VIOLATION" },
      { status: "VIOLATION" },
    ];
    expect(computeCompliancePercentage(responses)).toBe(50);
  });

  it("8. 1 COMPLIANT + 3 VIOLATION returns 25", () => {
    const responses: ResponseTally[] = [
      { status: "COMPLIANT" },
      { status: "VIOLATION" },
      { status: "VIOLATION" },
      { status: "VIOLATION" },
    ];
    expect(computeCompliancePercentage(responses)).toBe(25);
  });

  it("9. All VIOLATION responses returns 0", () => {
    const responses: ResponseTally[] = [
      { status: "VIOLATION" },
      { status: "VIOLATION" },
      { status: "VIOLATION" },
    ];
    expect(computeCompliancePercentage(responses)).toBe(0);
  });

  it("10. Result is an integer (Math.round applied)", () => {
    // 2 out of 3 = 66.666... → rounds to 67
    const responses: ResponseTally[] = [
      { status: "COMPLIANT" },
      { status: "COMPLIANT" },
      { status: "VIOLATION" },
    ];
    const result = computeCompliancePercentage(responses);
    expect(result).toBe(67);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ─── mapComplianceToScoreLabel ───────────────────────────────────────────────

describe("mapComplianceToScoreLabel", () => {
  it("11. null input returns null (Not Examined)", () => {
    expect(mapComplianceToScoreLabel(null)).toBeNull();
  });

  it("12. 100% returns FULLY_COMPLIANT", () => {
    expect(mapComplianceToScoreLabel(100)).toBe("FULLY_COMPLIANT");
  });

  it("13. 99% returns LARGELY_COMPLIANT", () => {
    expect(mapComplianceToScoreLabel(99)).toBe("LARGELY_COMPLIANT");
  });

  it("14. 75% returns LARGELY_COMPLIANT (inclusive lower boundary)", () => {
    expect(mapComplianceToScoreLabel(75)).toBe("LARGELY_COMPLIANT");
  });

  it("15. 74% returns PARTIALLY_COMPLIANT (just below LARGELY threshold)", () => {
    expect(mapComplianceToScoreLabel(74)).toBe("PARTIALLY_COMPLIANT");
  });

  it("16. 50% returns PARTIALLY_COMPLIANT (inclusive lower boundary)", () => {
    expect(mapComplianceToScoreLabel(50)).toBe("PARTIALLY_COMPLIANT");
  });

  it("17. 49% returns NON_COMPLIANT (just below PARTIALLY threshold)", () => {
    expect(mapComplianceToScoreLabel(49)).toBe("NON_COMPLIANT");
  });

  it("18. 0% returns NON_COMPLIANT", () => {
    expect(mapComplianceToScoreLabel(0)).toBe("NON_COMPLIANT");
  });

  it("19. Boundary: exactly 75% is LARGELY (not PARTIALLY)", () => {
    expect(mapComplianceToScoreLabel(75)).toBe("LARGELY_COMPLIANT");
    expect(mapComplianceToScoreLabel(74)).toBe("PARTIALLY_COMPLIANT");
  });

  it("20. Boundary: exactly 50% is PARTIALLY (not NON_COMPLIANT)", () => {
    expect(mapComplianceToScoreLabel(50)).toBe("PARTIALLY_COMPLIANT");
    expect(mapComplianceToScoreLabel(49)).toBe("NON_COMPLIANT");
  });

  it("21. Boundary: exactly 100% is FULLY (not LARGELY)", () => {
    expect(mapComplianceToScoreLabel(100)).toBe("FULLY_COMPLIANT");
    expect(mapComplianceToScoreLabel(99)).toBe("LARGELY_COMPLIANT");
  });

  it("22. Mid-range: 80% returns LARGELY_COMPLIANT", () => {
    expect(mapComplianceToScoreLabel(80)).toBe("LARGELY_COMPLIANT");
  });

  it("23. Mid-range: 60% returns PARTIALLY_COMPLIANT", () => {
    expect(mapComplianceToScoreLabel(60)).toBe("PARTIALLY_COMPLIANT");
  });

  it("24. Mid-range: 25% returns NON_COMPLIANT", () => {
    expect(mapComplianceToScoreLabel(25)).toBe("NON_COMPLIANT");
  });
});

// ─── computeModuleComplianceScores ───────────────────────────────────────────

describe("computeModuleComplianceScores", () => {
  it("25. Empty map returns empty array", () => {
    const result = computeModuleComplianceScores(new Map());
    expect(result).toEqual([]);
  });

  it("26. Single question, all COMPLIANT responses → 100% compliance, FULLY_COMPLIANT", () => {
    const map = new Map<string, ResponseTally[]>([
      ["q1", [{ status: "COMPLIANT" }, { status: "COMPLIANT" }]],
    ]);
    const result = computeModuleComplianceScores(map);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject<Partial<QuestionComplianceResult>>({
      questionId: "q1",
      compliancePercentage: 100,
      scoreLabel: "FULLY_COMPLIANT",
      totalResponses: 2,
      compliantCount: 2,
      violationCount: 0,
    });
  });

  it("27. Single question, all VIOLATION responses → 0% compliance, NON_COMPLIANT", () => {
    const map = new Map<string, ResponseTally[]>([
      ["q1", [{ status: "VIOLATION" }, { status: "VIOLATION" }]],
    ]);
    const result = computeModuleComplianceScores(map);
    expect(result[0]).toMatchObject<Partial<QuestionComplianceResult>>({
      questionId: "q1",
      compliancePercentage: 0,
      scoreLabel: "NON_COMPLIANT",
      totalResponses: 2,
      compliantCount: 0,
      violationCount: 2,
    });
  });

  it("28. Question with zero responses → null compliance, null scoreLabel", () => {
    const map = new Map<string, ResponseTally[]>([["q1", []]]);
    const result = computeModuleComplianceScores(map);
    expect(result[0]).toMatchObject<Partial<QuestionComplianceResult>>({
      questionId: "q1",
      compliancePercentage: null,
      scoreLabel: null,
      totalResponses: 0,
      compliantCount: 0,
      violationCount: 0,
    });
  });

  it("29. Multiple questions with mixed responses — returns per-question results", () => {
    const map = new Map<string, ResponseTally[]>([
      ["q1", [{ status: "COMPLIANT" }, { status: "COMPLIANT" }]], // 100% FC
      ["q2", [{ status: "COMPLIANT" }, { status: "VIOLATION" }]], // 50% PC
      ["q3", [{ status: "VIOLATION" }]], // 0% NC
      ["q4", []], // Not examined
    ]);
    const result = computeModuleComplianceScores(map);
    expect(result).toHaveLength(4);

    const byId = Object.fromEntries(result.map((r) => [r.questionId, r]));

    expect(byId["q1"].compliancePercentage).toBe(100);
    expect(byId["q1"].scoreLabel).toBe("FULLY_COMPLIANT");

    expect(byId["q2"].compliancePercentage).toBe(50);
    expect(byId["q2"].scoreLabel).toBe("PARTIALLY_COMPLIANT");

    expect(byId["q3"].compliancePercentage).toBe(0);
    expect(byId["q3"].scoreLabel).toBe("NON_COMPLIANT");

    expect(byId["q4"].compliancePercentage).toBeNull();
    expect(byId["q4"].scoreLabel).toBeNull();
  });

  it("30. Results are sorted by questionId", () => {
    const map = new Map<string, ResponseTally[]>([
      ["q3", [{ status: "COMPLIANT" }]],
      ["q1", [{ status: "COMPLIANT" }]],
      ["q2", [{ status: "VIOLATION" }]],
    ]);
    const result = computeModuleComplianceScores(map);
    expect(result.map((r) => r.questionId)).toEqual(["q1", "q2", "q3"]);
  });

  it("31. Boundary: 3 COMPLIANT + 1 VIOLATION → 75% → LARGELY_COMPLIANT", () => {
    const map = new Map<string, ResponseTally[]>([
      [
        "q1",
        [
          { status: "COMPLIANT" },
          { status: "COMPLIANT" },
          { status: "COMPLIANT" },
          { status: "VIOLATION" },
        ],
      ],
    ]);
    const result = computeModuleComplianceScores(map);
    expect(result[0].compliancePercentage).toBe(75);
    expect(result[0].scoreLabel).toBe("LARGELY_COMPLIANT");
  });

  it("32. Boundary: 2 COMPLIANT + 2 VIOLATION → 50% → PARTIALLY_COMPLIANT (not NON_COMPLIANT)", () => {
    const map = new Map<string, ResponseTally[]>([
      [
        "q1",
        [
          { status: "COMPLIANT" },
          { status: "COMPLIANT" },
          { status: "VIOLATION" },
          { status: "VIOLATION" },
        ],
      ],
    ]);
    const result = computeModuleComplianceScores(map);
    expect(result[0].compliancePercentage).toBe(50);
    expect(result[0].scoreLabel).toBe("PARTIALLY_COMPLIANT");
  });

  it("33. compliantCount and violationCount are correctly tallied", () => {
    const map = new Map<string, ResponseTally[]>([
      [
        "q1",
        [
          { status: "COMPLIANT" },
          { status: "VIOLATION" },
          { status: "COMPLIANT" },
          { status: "VIOLATION" },
          { status: "VIOLATION" },
        ],
      ],
    ]);
    const result = computeModuleComplianceScores(map);
    expect(result[0].compliantCount).toBe(2);
    expect(result[0].violationCount).toBe(3);
    expect(result[0].totalResponses).toBe(5);
  });
});
