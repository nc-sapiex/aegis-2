import { Document, Page, StyleSheet } from "@react-pdf/renderer";
import { CoverPage } from "./cover-page";
import { PageHeader } from "./pdf-primitives/page-header";
import { PageFooter } from "./pdf-primitives/page-footer";
import { GenericModuleSection } from "./generic-module-section";
import type { ModuleSectionData } from "@/lib/reporting/module-section";

// Same source type generate-xlsx.ts and audit-summary-document.tsx use —
// the return of getAuditReportData, minus null.
type AuditReportData = NonNullable<
  Awaited<ReturnType<typeof import("@/data-access/reports").getAuditReportData>>
>;

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 60,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1F2937",
  },
});

/**
 * The data-driven RBIA report (spec §6.2): a cover page followed by one
 * GenericModuleSection per selected module — no module-specific layout,
 * everything comes from ModuleSectionData.
 */
export function GenericRbiaReportDocument({
  auditData,
  modules,
}: {
  auditData: AuditReportData;
  modules: ModuleSectionData[];
}) {
  const bankName = auditData.branch?.name ?? "AEGIS Audit Platform";
  const periodLabel =
    auditData.periodFrom && auditData.periodTo
      ? `${new Date(auditData.periodFrom).toLocaleDateString("en-IN")} to ${new Date(auditData.periodTo).toLocaleDateString("en-IN")}`
      : "Period not set";
  const generatedAt = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Document
      title={`RBIA Report — ${auditData.auditNumber || auditData.id}`}
      author={bankName}
      creator="AEGIS Audit Platform"
    >
      <CoverPage
        bankName={bankName}
        reportTitle="Risk-Based Internal Audit Report"
        periodLabel={periodLabel}
        generatedAt={generatedAt}
      />

      <Page size="A4" style={styles.page}>
        <PageHeader bankName={bankName} />
        {modules.map((section, i) => (
          <GenericModuleSection
            key={`${section.moduleName}-${i}`}
            section={section}
          />
        ))}
        <PageFooter bankName={bankName} generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}
