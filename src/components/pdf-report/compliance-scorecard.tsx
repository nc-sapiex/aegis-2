import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { StackedBarChart } from "./pdf-charts/stacked-bar-chart";

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
  overallRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    padding: 8,
    backgroundColor: "#F0F9FF",
    borderRadius: 4,
  },
  overallLabel: {
    fontSize: 10,
    color: "#374151",
    marginRight: 8,
  },
  overallScore: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
  },
  overallTotal: {
    fontSize: 9,
    color: "#6B7280",
    marginLeft: 12,
  },
  table: {
    marginBottom: 12,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#1F2937",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E5E7EB",
  },
  tableRowAlt: {
    backgroundColor: "#F9FAFB",
  },
  headerCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
  },
  cell: {
    fontSize: 8,
    color: "#374151",
  },
  colCat: { width: "24%" },
  colNum: { width: "12%", textAlign: "center" },
  colScore: { width: "16%", textAlign: "center" },
  chartSection: { marginTop: 8 },
  chartTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    marginBottom: 4,
  },
});

const STATUS_COLORS = {
  compliant: "#10B981",
  partial: "#F59E0B",
  nonCompliant: "#EF4444",
  pending: "#94A3B8",
};

export interface ComplianceCategoryRow {
  category: string;
  total: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  pending: number;
  score: number;
}

interface ComplianceScorecardProps {
  overallScore: number;
  totalRequirements: number;
  byCategory: ComplianceCategoryRow[];
}

function scoreColor(score: number): string {
  if (score >= 80) return "#10B981";
  if (score >= 60) return "#F59E0B";
  return "#EF4444";
}

export function ComplianceScorecard({
  overallScore,
  totalRequirements,
  byCategory,
}: ComplianceScorecardProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>4. Compliance Scorecard</Text>

      {/* Overall score */}
      <View style={styles.overallRow}>
        <Text style={styles.overallLabel}>Overall Compliance:</Text>
        <Text
          style={[styles.overallScore, { color: scoreColor(overallScore) }]}
        >
          {overallScore}%
        </Text>
        <Text style={styles.overallTotal}>
          ({totalRequirements} requirements assessed)
        </Text>
      </View>

      {/* Category table */}
      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.headerCell, styles.colCat]}>Category</Text>
          <Text style={[styles.headerCell, styles.colNum]}>Total</Text>
          <Text style={[styles.headerCell, styles.colNum]}>Compliant</Text>
          <Text style={[styles.headerCell, styles.colNum]}>Partial</Text>
          <Text style={[styles.headerCell, styles.colNum]}>Non-Comp</Text>
          <Text style={[styles.headerCell, styles.colNum]}>Pending</Text>
          <Text style={[styles.headerCell, styles.colScore]}>Score</Text>
        </View>

        {byCategory.map((row, i) => (
          <View
            key={i}
            style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
          >
            <Text style={[styles.cell, styles.colCat]}>{row.category}</Text>
            <Text style={[styles.cell, styles.colNum]}>{row.total}</Text>
            <Text style={[styles.cell, styles.colNum]}>{row.compliant}</Text>
            <Text style={[styles.cell, styles.colNum]}>{row.partial}</Text>
            <Text style={[styles.cell, styles.colNum]}>{row.nonCompliant}</Text>
            <Text style={[styles.cell, styles.colNum]}>{row.pending}</Text>
            <Text
              style={[
                styles.cell,
                styles.colScore,
                { color: scoreColor(row.score), fontFamily: "Helvetica-Bold" },
              ]}
            >
              {row.score}%
            </Text>
          </View>
        ))}
      </View>

      {/* Stacked bar chart per category */}
      <View style={styles.chartSection}>
        <Text style={styles.chartTitle}>Status Distribution by Category</Text>
        <StackedBarChart
          data={byCategory.map((row) => ({
            label: row.category,
            segments: [
              {
                value: row.compliant,
                color: STATUS_COLORS.compliant,
                label: "Compliant",
              },
              {
                value: row.partial,
                color: STATUS_COLORS.partial,
                label: "Partial",
              },
              {
                value: row.nonCompliant,
                color: STATUS_COLORS.nonCompliant,
                label: "Non-Compliant",
              },
              {
                value: row.pending,
                color: STATUS_COLORS.pending,
                label: "Pending",
              },
            ],
          }))}
          width={450}
          height={160}
        />
      </View>
    </View>
  );
}
