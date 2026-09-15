import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ModuleSectionData } from "@/lib/reporting/module-section";
import { formatModuleScore } from "@/lib/format-score";

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
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: "#FAFAFA",
  },
  rowCode: {
    width: "15%",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#1F2937",
  },
  rowText: {
    width: "60%",
    fontSize: 8,
    color: "#4B5563",
  },
  rowResult: {
    width: "25%",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#1F2937",
  },
});

/**
 * Renders one module's report section. Every value comes from
 * ModuleSectionData (buildModuleSection's output) — this component makes no
 * decision about module identity or scoring, it only lays the data out.
 */
export function GenericModuleSection({
  section,
}: {
  section: ModuleSectionData;
}) {
  return (
    <View style={styles.section} wrap>
      <Text style={styles.sectionTitle}>
        {section.moduleName} ({section.kind}) —{" "}
        {formatModuleScore(section.score)}
      </Text>
      {section.rows.map((row, i) => (
        <View key={`${row.code}-${i}`} style={styles.row}>
          <Text style={styles.rowCode}>{row.code}</Text>
          <Text style={styles.rowText}>{row.text}</Text>
          <Text style={styles.rowResult}>{row.result}</Text>
        </View>
      ))}
    </View>
  );
}
