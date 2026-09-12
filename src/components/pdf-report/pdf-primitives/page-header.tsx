import { View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#D1D5DB",
    marginBottom: 16,
  },
  bankName: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#1F2937",
  },
  confidential: {
    fontSize: 7,
    fontFamily: "Helvetica-Oblique",
    color: "#9CA3AF",
  },
});

interface PageHeaderProps {
  bankName: string;
}

export function PageHeader({ bankName }: PageHeaderProps) {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.bankName}>{bankName}</Text>
      <Text style={styles.confidential}>CONFIDENTIAL</Text>
    </View>
  );
}
