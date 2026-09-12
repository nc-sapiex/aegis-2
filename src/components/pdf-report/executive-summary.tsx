import { View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#1E40AF",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#DBEAFE",
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    marginBottom: 4,
  },
  metricBox: {
    flex: 1,
    padding: 8,
    marginRight: 8,
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
    borderRadius: 4,
  },
  metricLabel: {
    fontSize: 7,
    color: "#6B7280",
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#1F2937",
  },
  riskHigh: { color: "#DC2626" },
  riskMedium: { color: "#F59E0B" },
  riskLow: { color: "#10B981" },
  commentary: {
    fontSize: 9,
    color: "#374151",
    lineHeight: 1.5,
    marginTop: 8,
    padding: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 4,
  },
  commentaryLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#6B7280",
    marginBottom: 4,
  },
  bullet: {
    fontSize: 9,
    color: "#374151",
    marginLeft: 8,
    marginBottom: 2,
  },
});

export interface ExecutiveSummaryData {
  complianceScore: number;
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  openFindings: number;
  overdueFindings: number;
  riskLevel: "high" | "medium" | "low";
  totalAudits: number;
  completedAudits: number;
  auditCompletionRate: number;
  crar?: string;
  npa?: string;
  executiveCommentary?: string;
  highlights: string[];
}

const RISK_STYLE = {
  high: styles.riskHigh,
  medium: styles.riskMedium,
  low: styles.riskLow,
};

export function ExecutiveSummary({ data }: { data: ExecutiveSummaryData }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>1. Executive Summary</Text>

      {/* Key metrics row */}
      <View style={styles.row}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Compliance Score</Text>
          <Text style={styles.metricValue}>{data.complianceScore}%</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Overall Risk</Text>
          <Text style={[styles.metricValue, RISK_STYLE[data.riskLevel]]}>
            {data.riskLevel.toUpperCase()}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Audit Completion</Text>
          <Text style={styles.metricValue}>{data.auditCompletionRate}%</Text>
        </View>
        <View style={[styles.metricBox, { marginRight: 0 }]}>
          <Text style={styles.metricLabel}>Open Findings</Text>
          <Text style={styles.metricValue}>{data.openFindings}</Text>
        </View>
      </View>

      {/* Second row: detailed counts */}
      <View style={styles.row}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Total Findings</Text>
          <Text style={styles.metricValue}>{data.totalFindings}</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>Critical</Text>
          <Text style={[styles.metricValue, styles.riskHigh]}>
            {data.criticalFindings}
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>High</Text>
          <Text style={[styles.metricValue, styles.riskMedium]}>
            {data.highFindings}
          </Text>
        </View>
        <View style={[styles.metricBox, { marginRight: 0 }]}>
          <Text style={styles.metricLabel}>Overdue</Text>
          <Text style={[styles.metricValue, styles.riskHigh]}>
            {data.overdueFindings}
          </Text>
        </View>
      </View>

      {/* CRAR / NPA if available */}
      {(data.crar || data.npa) && (
        <View style={styles.row}>
          {data.crar && (
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>CRAR</Text>
              <Text style={styles.metricValue}>{data.crar}</Text>
            </View>
          )}
          {data.npa && (
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Gross NPA %</Text>
              <Text style={styles.metricValue}>{data.npa}</Text>
            </View>
          )}
        </View>
      )}

      {/* Key highlights */}
      {data.highlights.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.commentaryLabel}>Key Highlights:</Text>
          {data.highlights.map((h, i) => (
            <Text key={i} style={styles.bullet}>
              {"\u2022"} {h}
            </Text>
          ))}
        </View>
      )}

      {/* Executive commentary (RPT-03) */}
      {data.executiveCommentary && (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.commentaryLabel}>CAE Commentary:</Text>
          <Text style={styles.commentary}>{data.executiveCommentary}</Text>
        </View>
      )}
    </View>
  );
}
