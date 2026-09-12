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
  severityGroup: {
    marginBottom: 10,
  },
  severityLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 2,
  },
  finding: {
    flexDirection: "row",
    marginBottom: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderLeftWidth: 3,
    backgroundColor: "#FAFAFA",
  },
  findingBody: {
    flex: 1,
  },
  findingTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#1F2937",
    marginBottom: 2,
  },
  findingMeta: {
    fontSize: 7,
    color: "#6B7280",
    marginBottom: 2,
  },
  findingExcerpt: {
    fontSize: 7,
    color: "#4B5563",
    lineHeight: 1.3,
  },
  overdue: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#DC2626",
  },
  statusBadge: {
    fontSize: 7,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    marginLeft: 4,
  },
});

const SEVERITY_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  CRITICAL: { bg: "#FEE2E2", border: "#DC2626", text: "#991B1B" },
  HIGH: { bg: "#FED7AA", border: "#EA580C", text: "#9A3412" },
  MEDIUM: { bg: "#FEF3C7", border: "#D97706", text: "#92400E" },
  LOW: { bg: "#D1FAE5", border: "#059669", text: "#065F46" },
};

export interface FindingItem {
  id: string;
  title: string;
  severity: string;
  status: string;
  branch: string;
  excerpt: string;
  assignedTo: string;
  dueDate: string;
  isOverdue: boolean;
}

interface KeyFindingsProps {
  findings: FindingItem[];
}

export function KeyFindings({ findings }: KeyFindingsProps) {
  // Group by severity
  const groups: Record<string, FindingItem[]> = {};
  for (const f of findings) {
    const sev = f.severity.toUpperCase();
    if (!groups[sev]) groups[sev] = [];
    groups[sev].push(f);
  }

  const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>3. Key Findings</Text>

      {order.map((severity) => {
        const items = groups[severity];
        if (!items || items.length === 0) return null;

        const colors = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.MEDIUM;

        return (
          <View key={severity} style={styles.severityGroup}>
            <Text
              style={[
                styles.severityLabel,
                { backgroundColor: colors.bg, color: colors.text },
              ]}
            >
              {severity} ({items.length})
            </Text>

            {items.map((f) => (
              <View
                key={f.id}
                style={[styles.finding, { borderLeftColor: colors.border }]}
              >
                <View style={styles.findingBody}>
                  <Text style={styles.findingTitle}>
                    [{f.id}] {f.title}
                  </Text>
                  <Text style={styles.findingMeta}>
                    Branch: {f.branch} | Assigned: {f.assignedTo} | Due:{" "}
                    {f.dueDate}
                    {f.isOverdue ? " (OVERDUE)" : ""}
                  </Text>
                  <Text style={styles.findingExcerpt}>{f.excerpt}</Text>
                  {f.isOverdue && (
                    <Text style={styles.overdue}>
                      Action Required — Past due date
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
