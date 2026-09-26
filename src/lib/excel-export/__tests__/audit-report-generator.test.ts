import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { generateAuditReportXLSX } from "../audit-report-generator";

function observation(severity: string, n: number) {
  return {
    title: `${severity} finding ${n}`,
    description: `${severity} description ${n}`,
    recommendation: `${severity} recommendation ${n}`,
    severity,
    status: "OPEN",
    auditArea: { name: "Credit" },
  };
}

type ReportInput = Parameters<typeof generateAuditReportXLSX>[0];

function reportData(
  observations: ReturnType<typeof observation>[],
): ReportInput {
  return {
    auditNumber: "RBIA/2025-26/BR-001/V1",
    auditType: "CONCURRENT",
    status: "COMPLETED",
    periodFrom: null,
    periodTo: null,
    overallRiskRating: null,
    branch: null,
    cashChecks: [],
    teamMembers: [],
    modules: [],
    observations,
    // Real callers build this from getAuditReportData(), a large DAL-derived
    // shape this test doesn't otherwise need — only the severity-tab layout
    // under test reads `observations`. Cast through `unknown` deliberately.
  } as unknown as ReportInput;
}

async function loadSeveritySheet(
  observations: ReturnType<typeof observation>[],
) {
  const buffer = await generateAuditReportXLSX(reportData(observations));
  const workbook = new ExcelJS.Workbook();
  // ExcelJS's bundled types don't match @types/node's generic Buffer;
  // same `as any` idiom already used at every other xlsx.load() call site
  // in this codebase (excel-export.test.ts, org-structure-parser.ts,
  // loan-portfolio/excel-parser.ts, reporting-engine.test.ts).
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.getWorksheet("Observations by Severity");
  expect(sheet).toBeDefined();
  return sheet!;
}

describe("generateAuditReportXLSX — Observations by Severity", () => {
  it("keeps a 19-row MEDIUM band from overwriting the next severity block", async () => {
    // 19 MEDIUM rows + title + header is 21 rows. The previous layout
    // pinned LOW at row 61, which is also MEDIUM's last data row.
    const observations = [
      ...Array.from({ length: 2 }, (_, i) => observation("HIGH", i + 1)),
      ...Array.from({ length: 19 }, (_, i) => observation("MEDIUM", i + 1)),
      observation("LOW", 1),
    ];

    const sheet = await loadSeveritySheet(observations);
    const texts: string[] = [];
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value != null) texts.push(String(cell.value));
      });
    });

    expect(texts).toContain("HIGH Severity Observations (2)");
    expect(texts).toContain("MEDIUM Severity Observations (19)");
    expect(texts).toContain("LOW Severity Observations (1)");
    for (let i = 1; i <= 19; i++) {
      expect(texts).toContain(`MEDIUM finding ${i}`);
    }
    expect(texts).toContain("HIGH finding 1");
    expect(texts).toContain("HIGH finding 2");
    expect(texts).toContain("LOW finding 1");
  });
});
