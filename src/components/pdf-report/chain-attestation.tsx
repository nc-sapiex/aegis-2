import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

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

/**
 * Examiner-facing statement of a tenant's audit chain (spec §5): the head an
 * examiner can compare against later, and the recent verification record.
 * Not yet signed; signing needs the platform key from the licensing work.
 */
export function ChainAttestation({
  tenantName,
  generatedAt,
  head,
  history,
}: ChainAttestationProps) {
  return (
    <Document title={`Audit chain attestation — ${tenantName}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Audit chain attestation</Text>
        <Field label="Bank" value={tenantName} />
        <Field label="Generated (UTC)" value={generatedAt.toISOString()} />
        <Field
          label="Audit trail entries"
          value={head ? head.lastSequence.toString() : "0"}
        />
        <Field
          label="Head hash (SHA-256)"
          value={head ? head.lastHash.toString("hex") : "No entries yet"}
        />
        <Field
          label="Head updated (UTC)"
          value={head ? head.updatedAt.toISOString() : "—"}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent verifications (UTC)</Text>
          {history.length === 0 && <Text>No verification has run yet.</Text>}
          {history.map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <Text style={styles.cell}>{h.verifiedAt.toISOString()}</Text>
              <Text style={styles.cell}>
                {h.ok ? "Intact" : `Broken at entry #${h.firstBadSequence}`}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          Each audit trail entry carries the SHA-256 hash of the entry before
          it. Re-verifying the chain and comparing its head hash with the value
          above shows whether any entry up to this point has changed since this
          document was generated. This document is not digitally signed.
        </Text>
      </Page>
    </Document>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 16 },
  row: { flexDirection: "row", marginBottom: 6 },
  label: { width: 140, color: "#4B5A70" },
  value: { flex: 1 },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 12, marginBottom: 8 },
  historyRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#D3DBE4",
    paddingVertical: 4,
  },
  cell: { flex: 1 },
  note: { marginTop: 24, color: "#4B5A70", lineHeight: 1.4 },
});
