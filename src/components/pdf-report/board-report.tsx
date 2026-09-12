import { Document, Page, StyleSheet } from "@react-pdf/renderer";
import { CoverPage } from "./cover-page";
import { PageHeader } from "./pdf-primitives/page-header";
import { PageFooter } from "./pdf-primitives/page-footer";
import {
  ExecutiveSummary,
  type ExecutiveSummaryData,
} from "./executive-summary";
import { AuditCoverage, type AuditCoverageRow } from "./audit-coverage";
import { KeyFindings, type FindingItem } from "./key-findings";
import {
  ComplianceScorecard,
  type ComplianceCategoryRow,
} from "./compliance-scorecard";
import { Recommendations, type RecommendationItem } from "./recommendations";
import { RepeatFindings, type RepeatFindingItem } from "./repeat-findings";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 60,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1F2937",
  },
});

export interface BoardReportData {
  bankName: string;
  reportTitle: string;
  periodLabel: string;
  generatedAt: string;
  executiveSummary: ExecutiveSummaryData;
  auditCoverage: AuditCoverageRow[];
  branchCoverage?: { covered: number; total: number };
  findings: FindingItem[];
  complianceOverallScore: number;
  complianceTotalRequirements: number;
  complianceByCategory: ComplianceCategoryRow[];
  recommendations: RecommendationItem[];
  repeatFindings: RepeatFindingItem[];
}

export function BoardReport({ data }: { data: BoardReportData }) {
  return (
    <Document
      title={data.reportTitle}
      author={data.bankName}
      creator="AEGIS Audit Platform"
    >
      {/* Cover page — standalone, no header/footer */}
      <CoverPage
        bankName={data.bankName}
        reportTitle={data.reportTitle}
        periodLabel={data.periodLabel}
        generatedAt={data.generatedAt}
      />

      {/* Section 1 + 2: Executive Summary + Audit Coverage */}
      <Page size="A4" style={styles.page}>
        <PageHeader bankName={data.bankName} />
        <ExecutiveSummary data={data.executiveSummary} />
        <AuditCoverage
          data={data.auditCoverage}
          branchCoverage={data.branchCoverage}
        />
        <PageFooter bankName={data.bankName} generatedAt={data.generatedAt} />
      </Page>

      {/* Section 3: Key Findings */}
      <Page size="A4" style={styles.page}>
        <PageHeader bankName={data.bankName} />
        <KeyFindings findings={data.findings} />
        <PageFooter bankName={data.bankName} generatedAt={data.generatedAt} />
      </Page>

      {/* Section 4: Compliance Scorecard */}
      <Page size="A4" style={styles.page}>
        <PageHeader bankName={data.bankName} />
        <ComplianceScorecard
          overallScore={data.complianceOverallScore}
          totalRequirements={data.complianceTotalRequirements}
          byCategory={data.complianceByCategory}
        />
        <PageFooter bankName={data.bankName} generatedAt={data.generatedAt} />
      </Page>

      {/* Section 5 + 6: Recommendations + Repeat Findings */}
      <Page size="A4" style={styles.page}>
        <PageHeader bankName={data.bankName} />
        <Recommendations recommendations={data.recommendations} />
        <RepeatFindings findings={data.repeatFindings} />
        <PageFooter bankName={data.bankName} generatedAt={data.generatedAt} />
      </Page>
    </Document>
  );
}
