import type { ModuleSectionData } from "@/lib/reporting/module-section";
import { formatScore } from "@/lib/format-score";

/**
 * Row data for one module's worksheet, header rows included. The caller
 * (addModuleSheet in audit-report-generator.ts) writes these into an ExcelJS
 * worksheet the same way the existing addXSheet functions do.
 */
export function buildModuleSheetRows(
  section: ModuleSectionData,
): (string | number)[][] {
  return [
    [
      `${section.moduleName} (${section.kind})`,
      `Score: ${formatScore(section.score)}%`,
    ],
    ["Code", "Statement", "Result"],
    ...section.rows.map((r) => [r.code, r.text, r.result]),
  ];
}
