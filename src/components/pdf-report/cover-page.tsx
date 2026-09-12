import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 60,
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  bankName: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: "#1F2937",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 40,
    textAlign: "center",
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#1E40AF",
    marginBottom: 8,
    textAlign: "center",
  },
  period: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 60,
    textAlign: "center",
  },
  divider: {
    width: 120,
    height: 2,
    backgroundColor: "#1E40AF",
    marginBottom: 40,
  },
  confidential: {
    fontSize: 10,
    fontFamily: "Helvetica-BoldOblique",
    color: "#DC2626",
    marginBottom: 6,
    textAlign: "center",
  },
  notice: {
    fontSize: 8,
    color: "#9CA3AF",
    textAlign: "center",
    maxWidth: 300,
  },
  generatedAt: {
    position: "absolute",
    bottom: 40,
    fontSize: 8,
    color: "#9CA3AF",
  },
});

interface CoverPageProps {
  bankName: string;
  reportTitle: string;
  periodLabel: string;
  generatedAt: string;
}

export function CoverPage({
  bankName,
  reportTitle,
  periodLabel,
  generatedAt,
}: CoverPageProps) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.bankName}>{bankName}</Text>
      <Text style={styles.subtitle}>Internal Audit Department</Text>

      <View style={styles.divider} />

      <Text style={styles.title}>{reportTitle}</Text>
      <Text style={styles.period}>{periodLabel}</Text>

      <Text style={styles.confidential}>CONFIDENTIAL</Text>
      <Text style={styles.notice}>
        This document is confidential and intended solely for the Board of
        Directors and Audit Committee. Unauthorized distribution is prohibited.
      </Text>

      <Text style={styles.generatedAt}>Generated: {generatedAt}</Text>
    </Page>
  );
}
