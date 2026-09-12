import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { BarChart } from "./pdf-charts/bar-chart";

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
  colType: { width: "30%" },
  colNum: { width: "14%", textAlign: "center" },
  colRate: { width: "14%", textAlign: "center" },
  chartSection: { marginTop: 8 },
  chartTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    marginBottom: 4,
  },
});

export interface AuditCoverageRow {
  type: string;
  planned: number;
  completed: number;
  inProgress: number;
  completionRate: number;
}

interface AuditCoverageProps {
  data: AuditCoverageRow[];
  branchCoverage?: { covered: number; total: number };
}

export function AuditCoverage({ data, branchCoverage }: AuditCoverageProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>2. Audit Coverage</Text>

      {/* Coverage table */}
      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.headerCell, styles.colType]}>Audit Type</Text>
          <Text style={[styles.headerCell, styles.colNum]}>Planned</Text>
          <Text style={[styles.headerCell, styles.colNum]}>Completed</Text>
          <Text style={[styles.headerCell, styles.colNum]}>In Progress</Text>
          <Text style={[styles.headerCell, styles.colRate]}>Rate</Text>
        </View>

        {data.map((row, i) => (
          <View
            key={i}
            style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
          >
            <Text style={[styles.cell, styles.colType]}>{row.type}</Text>
            <Text style={[styles.cell, styles.colNum]}>{row.planned}</Text>
            <Text style={[styles.cell, styles.colNum]}>{row.completed}</Text>
            <Text style={[styles.cell, styles.colNum]}>{row.inProgress}</Text>
            <Text style={[styles.cell, styles.colRate]}>
              {row.completionRate}%
            </Text>
          </View>
        ))}
      </View>

      {/* Branch coverage */}
      {branchCoverage && (
        <Text style={{ fontSize: 8, color: "#374151", marginBottom: 8 }}>
          Branch Coverage: {branchCoverage.covered} of {branchCoverage.total}{" "}
          branches audited (
          {Math.round((branchCoverage.covered / branchCoverage.total) * 100)}%)
        </Text>
      )}

      {/* Completion rate bar chart */}
      <View style={styles.chartSection}>
        <Text style={styles.chartTitle}>Completion Rate by Audit Type</Text>
        <BarChart
          data={data.map((row) => ({
            label: row.type.replace(" Audit", ""),
            value: row.completionRate,
            color:
              row.completionRate >= 75
                ? "#10B981"
                : row.completionRate >= 50
                  ? "#F59E0B"
                  : "#EF4444",
          }))}
          width={450}
          height={120}
        />
      </View>
    </View>
  );
}
