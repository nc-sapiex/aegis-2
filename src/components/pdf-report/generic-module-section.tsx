import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { CoverPage } from "./cover-page";
import { PageFooter } from "./pdf-primitives/page-footer";
import { PageHeader } from "./pdf-primitives/page-header";
import type { ModuleSectionData } from "@/lib/reporting/module-section";

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
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#1E40AF",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#DBEAFE",
    paddingBottom: 4,
  },
  summaryBox: {
    padding: 12,
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
    borderRadius: 4,
    backgroundColor: "#F9FAFB",
  },
  row: {
    flexDirection: "row",
    marginBottom: 6,
  },
  summaryLabel: {
    width: "35%",
    fontFamily: "Helvetica-Bold",
  },
  summaryValue: {
    width: "65%",
  },
  rowCode: {
    width: "18%",
    fontFamily: "Helvetica-Bold",
  },
  rowText: {
    width: "54%",
  },
  rowResult: {
    width: "28%",
    textAlign: "right",
  },
  emptyState: {
    color: "#6B7280",
    fontSize: 9,
  },
});

const MODULE_ROWS_PER_PAGE = 24;

function formatScore(score: number): string {
  return (score * 100).toFixed(1);
}

function formatPeriod(auditData: AuditReportData): string {
  if (!auditData.periodFrom || !auditData.periodTo) {
    return "N/A";
  }

  return `${new Date(auditData.periodFrom).toLocaleDateString("en-IN")} to ${new Date(auditData.periodTo).toLocaleDateString("en-IN")}`;
}

export function GenericModuleSection({
  section,
  titleSuffix,
}: {
  section: ModuleSectionData;
  titleSuffix?: string;
}) {
  return (
    <View style={styles.section} wrap>
      <Text style={styles.sectionTitle}>
        {section.moduleName} ({section.kind}) — {formatScore(section.score)}%
        {titleSuffix}
      </Text>
      {section.rows.length === 0 ? (
        <Text style={styles.emptyState}>No statements available for this module.</Text>
      ) : (
        section.rows.map((row, index) => (
          <View key={`${row.code}-${index}`} style={styles.row}>
            <Text style={styles.rowCode}>{row.code}</Text>
            <Text style={styles.rowText}>{row.text}</Text>
            <Text style={styles.rowResult}>{row.result}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function chunkRows(rows: ModuleSectionData["rows"]) {
  if (rows.length === 0) {
    return [[]];
  }

  const chunks: ModuleSectionData["rows"][] = [];
  for (let index = 0; index < rows.length; index += MODULE_ROWS_PER_PAGE) {
    chunks.push(rows.slice(index, index + MODULE_ROWS_PER_PAGE));
  }

  return chunks;
}

export function GenericRbiaReportDocument({
  auditData,
  modules,
}: {
  auditData: AuditReportData;
  modules: ModuleSectionData[];
}) {
  const bankName = auditData.tenant?.name ?? "AEGIS Audit Platform";
  const generatedAt = new Date().toLocaleString("en-IN");
  const observationCount = auditData.observations?.length ?? 0;
  const scoredRowCount = modules.reduce(
    (count, module) =>
      count + module.rows.filter((row) => row.result !== "unscored").length,
    0,
  );

  return (
    <Document
      title={`RBIA Report - ${auditData.auditNumber ?? auditData.id}`}
      author={bankName}
      creator="AEGIS Audit Platform"
    >
      <CoverPage
        bankName={bankName}
        reportTitle="RBIA Module Report"
        periodLabel={formatPeriod(auditData)}
        generatedAt={generatedAt}
      />

      <Page size="A4" style={styles.page}>
        <PageHeader bankName={bankName} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <View style={styles.summaryBox}>
            <View style={styles.row}>
              <Text style={styles.summaryLabel}>Audit Number</Text>
              <Text style={styles.summaryValue}>
                {auditData.auditNumber ?? auditData.id}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.summaryLabel}>Branch</Text>
              <Text style={styles.summaryValue}>
                {auditData.branch?.name ?? "N/A"} ({auditData.branch?.code ?? "N/A"})
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.summaryLabel}>Audit Type</Text>
              <Text style={styles.summaryValue}>{auditData.auditType ?? "RBIA"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.summaryLabel}>Period</Text>
              <Text style={styles.summaryValue}>{formatPeriod(auditData)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.summaryLabel}>Overall Risk Rating</Text>
              <Text style={styles.summaryValue}>
                {auditData.overallRiskRating ?? "Not computed"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.summaryLabel}>Modules Covered</Text>
              <Text style={styles.summaryValue}>{modules.length}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.summaryLabel}>Scored Statements</Text>
              <Text style={styles.summaryValue}>{scoredRowCount}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.summaryLabel}>Observations</Text>
              <Text style={styles.summaryValue}>{observationCount}</Text>
            </View>
          </View>
        </View>

        <PageFooter bankName={bankName} generatedAt={generatedAt} />
      </Page>

      {modules.flatMap((module) =>
        chunkRows(module.rows).map((rows, index) => (
          <Page
            key={`${module.moduleName}-${module.kind}-${index + 1}`}
            size="A4"
            style={styles.page}
          >
            <PageHeader bankName={bankName} />
            <GenericModuleSection
              section={{ ...module, rows }}
              titleSuffix={index === 0 ? "" : " (continued)"}
            />
            <PageFooter bankName={bankName} generatedAt={generatedAt} />
          </Page>
        )),
      )}
    </Document>
  );
}
