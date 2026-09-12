import { View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderTopColor: "#D1D5DB",
    paddingTop: 6,
  },
  text: {
    fontSize: 7,
    color: "#9CA3AF",
  },
  center: {
    fontSize: 7,
    color: "#6B7280",
  },
});

interface PageFooterProps {
  bankName: string;
  generatedAt: string;
}

export function PageFooter({ bankName, generatedAt }: PageFooterProps) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.text}>Generated: {generatedAt}</Text>
      <Text style={styles.center}>{bankName}</Text>
      <Text
        style={styles.text}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}
