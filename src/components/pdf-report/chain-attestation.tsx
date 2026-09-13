import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6, gap: 12 },
  label: { color: "#555" },
  section: { marginTop: 20 },
  sectionTitle: { marginBottom: 8, fontSize: 13 },
  historyHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    paddingBottom: 4,
    marginBottom: 4,
  },
  historyRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingVertical: 4,
  },
  historyDate: { width: "65%" },
  historyResult: { width: "35%", textAlign: "right" },
  note: { marginTop: 14, color: "#555", fontSize: 9, lineHeight: 1.4 },
});

export interface ChainAttestationProps {
  tenantName: string;
  generatedAt: Date;
  head: { lastSequence: bigint; lastHash: Buffer; updatedAt: Date } | null;
  history: {
    id: string;
    verifiedAt: Date;
    ok: boolean;
    firstBadSequence: bigint | null;
  }[];
}

export function ChainAttestation({
  tenantName,
  generatedAt,
  head,
  history,
}: ChainAttestationProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Audit Chain Attestation</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Bank</Text>
          <Text>{tenantName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Generated</Text>
          <Text>{generatedAt.toISOString()}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Chain length</Text>
          <Text>{head ? head.lastSequence.toString() : "0"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Head hash (SHA-256)</Text>
          <Text>{head ? head.lastHash.toString("hex") : "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Head updated</Text>
          <Text>{head ? head.updatedAt.toISOString() : "—"}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent verifications</Text>
          {history.length === 0 ? (
            <Text>No verifications recorded yet.</Text>
          ) : (
            <>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDate}>Verified at</Text>
                  <Text style={styles.historyResult}>Result</Text>
                </View>
                {history.map((item) => (
                  <View key={item.id} style={styles.historyRow}>
                    <Text style={styles.historyDate}>{item.verifiedAt.toISOString()}</Text>
                    <Text style={styles.historyResult}>
                      {item.ok ? "OK" : `FAILED at #${item.firstBadSequence}`}
                    </Text>
                  </View>
                ))}
            </>
          )}
        </View>
        <Text style={styles.note}>
          This export records the current audit-chain head and recent verification
          outcomes. A repository signing key for cryptographic attestation is a
          follow-up dependency and is not yet configured in this codebase.
        </Text>
      </Page>
    </Document>
  );
}
