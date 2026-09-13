import { describe, expect, it } from "vitest";
import { buildModuleSection } from "../module-section";

describe("buildModuleSection", () => {
  it("renders a CHECKLIST module from statements and responses, without a module-identity switch", () => {
    const section = buildModuleSection(
      { code: "CRD", name: "Credit", kinds: ["CHECKLIST"] },
      [
        {
          nodeId: "n1",
          questionId: null,
          text: "Loan file complete",
          weight: 1,
          isCritical: false,
        },
      ],
      [{ nodeId: "n1", accountRecordId: null, scoreLabel: "FULLY_COMPLIANT" }],
    );

    expect(section.moduleName).toBe("Credit");
    expect(section.rows).toEqual([
      { code: "n1", text: "Loan file complete", result: "FULLY_COMPLIANT" },
    ]);
  });

  it("renders a POPULATION_SAMPLE module the same way, from account responses instead of node responses", () => {
    const section = buildModuleSection(
      { code: "FX", name: "Forex", kinds: ["POPULATION_SAMPLE"] },
      [
        {
          nodeId: null,
          questionId: "q1",
          text: "FEMA on file",
          weight: 1,
          isCritical: true,
        },
      ],
      [
        {
          nodeId: null,
          accountRecordId: "acc-1",
          questionId: "q1",
          scoreLabel: "NON_COMPLIANT",
        },
      ],
    );

    expect(section.rows[0].result).toBe("NON_COMPLIANT");
  });

  it("a statement with no response yet renders as unscored, not a crash", () => {
    const section = buildModuleSection(
      { code: "CRD", name: "Credit", kinds: ["CHECKLIST"] },
      [
        {
          nodeId: "n1",
          questionId: null,
          text: "x",
          weight: 1,
          isCritical: false,
        },
      ],
      [],
    );

    expect(section.rows[0].result).toBe("unscored");
  });
});
