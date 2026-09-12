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
  item: {
    marginBottom: 8,
    padding: 8,
    borderLeftWidth: 3,
    backgroundColor: "#FAFAFA",
    borderRadius: 2,
  },
  priorityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  priorityBadge: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    marginRight: 6,
  },
  title: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#1F2937",
  },
  description: {
    fontSize: 8,
    color: "#4B5563",
    lineHeight: 1.4,
    marginBottom: 4,
  },
  meta: {
    fontSize: 7,
    color: "#6B7280",
  },
});

const PRIORITY_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  critical: { bg: "#FEE2E2", border: "#DC2626", text: "#991B1B" },
  high: { bg: "#FED7AA", border: "#EA580C", text: "#9A3412" },
  medium: { bg: "#FEF3C7", border: "#D97706", text: "#92400E" },
};

export interface RecommendationItem {
  priority: "critical" | "high" | "medium";
  title: string;
  description: string;
  relatedFindingIds: string[];
  targetDate: string;
  riskCategory?: string;
}

interface RecommendationsProps {
  recommendations: RecommendationItem[];
}

export function Recommendations({ recommendations }: RecommendationsProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>5. Recommendations</Text>

      {recommendations.map((rec, i) => {
        const colors = PRIORITY_COLORS[rec.priority] ?? PRIORITY_COLORS.medium;

        return (
          <View
            key={i}
            style={[styles.item, { borderLeftColor: colors.border }]}
          >
            <View style={styles.priorityRow}>
              <Text
                style={[
                  styles.priorityBadge,
                  { backgroundColor: colors.bg, color: colors.text },
                ]}
              >
                {rec.priority.toUpperCase()}
              </Text>
              <Text style={styles.title}>{rec.title}</Text>
            </View>

            <Text style={styles.description}>{rec.description}</Text>

            <Text style={styles.meta}>
              Target: {rec.targetDate} | Related Findings:{" "}
              {rec.relatedFindingIds.map((id) => id.slice(0, 8)).join(", ")}
              {rec.riskCategory ? ` | Risk: ${rec.riskCategory}` : ""}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
