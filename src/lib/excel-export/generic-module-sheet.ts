import type { ModuleSectionData } from "@/lib/reporting/module-section";

export function buildModuleSheetRows(
  section: ModuleSectionData,
): (string | number)[][] {
  return [
    [`${section.moduleName} (${section.kind})`, `Score: ${(section.score * 100).toFixed(1)}%`],
    ["Code", "Statement", "Result"],
    ...section.rows.map((row) => [row.code, row.text, row.result]),
  ];
}
