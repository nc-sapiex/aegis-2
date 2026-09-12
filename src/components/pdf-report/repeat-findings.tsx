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
  empty: {
    fontSize: 9,
    color: "#6B7280",
    fontFamily: "Helvetica-Oblique",
  },
  table: { marginBottom: 8 },
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
  colTitle: { width: "30%" },
  colDate: { width: "16%" },
  colSev: { width: "14%", textAlign: "center" },
  colOccurrence: { width: "12%", textAlign: "center" },
  colEscalated: { width: "14%", textAlign: "center" },
  colStatus: { width: "14%", textAlign: "center" },
  escalated: {
    color: "#DC2626",
    fontFamily: "Helvetica-Bold",
  },
});

export interface RepeatFindingItem {
  title: string;
  originalDate: string;
  occurrenceCount: number;
  currentSeverity: string;
  previousSeverity: string;
  status: string;
}

interface RepeatFindingsProps {
  findings: RepeatFindingItem[];
}

export function RepeatFindings({ findings }: RepeatFindingsProps) {
  const isEscalated = (f: RepeatFindingItem) => {
    const order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    return (
      order.indexOf(f.currentSeverity.toUpperCase()) >
      order.indexOf(f.previousSeverity.toUpperCase())
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>6. Repeat Findings (RPT-05)</Text>

      {findings.length === 0 ? (
        <Text style={styles.empty}>
          No repeat findings identified in this period.
        </Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.headerCell, styles.colTitle]}>Title</Text>
            <Text style={[styles.headerCell, styles.colDate]}>
              Original Date
            </Text>
            <Text style={[styles.headerCell, styles.colOccurrence]}>
              Occurrences
            </Text>
            <Text style={[styles.headerCell, styles.colSev]}>Severity</Text>
            <Text style={[styles.headerCell, styles.colEscalated]}>
              Escalated
            </Text>
            <Text style={[styles.headerCell, styles.colStatus]}>Status</Text>
          </View>

          {findings.map((f, i) => (
            <View
              key={i}
              style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
            >
              <Text style={[styles.cell, styles.colTitle]}>{f.title}</Text>
              <Text style={[styles.cell, styles.colDate]}>
                {f.originalDate}
              </Text>
              <Text style={[styles.cell, styles.colOccurrence]}>
                {f.occurrenceCount}
              </Text>
              <Text style={[styles.cell, styles.colSev]}>
                {f.currentSeverity}
              </Text>
              <Text
                style={[
                  styles.cell,
                  styles.colEscalated,
                  isEscalated(f) ? styles.escalated : {},
                ]}
              >
                {isEscalated(f) ? "YES" : "No"}
              </Text>
              <Text style={[styles.cell, styles.colStatus]}>{f.status}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
